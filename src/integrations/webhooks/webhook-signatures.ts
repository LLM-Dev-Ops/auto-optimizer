/**
 * Webhook Signature System
 * HMAC-SHA256 payload signing for secure webhook delivery
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { WebhookPayload, WebhookSignature, WebhookError, WebhookErrorType } from './webhook-types';

/**
 * Webhook signature service for payload signing and verification
 */
export class WebhookSignatureService {
  private readonly algorithm = 'sha256';
  private readonly encoding: BufferEncoding = 'hex';

  /**
   * Generate HMAC-SHA256 signature for webhook payload
   *
   * @param payload - Webhook payload to sign
   * @param secret - Shared secret for signing
   * @param timestamp - Optional timestamp (defaults to current time)
   * @returns Signature object with signature, timestamp, and algorithm
   */
  public generateSignature(
    payload: WebhookPayload,
    secret: string,
    timestamp?: number,
  ): WebhookSignature {
    if (!secret || secret.trim().length === 0) {
      throw new WebhookError(
        'Secret is required for signature generation',
        WebhookErrorType.SIGNATURE_ERROR,
        undefined,
        false,
      );
    }

    const signatureTimestamp = timestamp || Date.now();
    const payloadString = this.serializePayload(payload, signatureTimestamp);
    const signature = this.computeHmac(payloadString, secret);

    return {
      signature,
      timestamp: signatureTimestamp,
      algorithm: this.algorithm,
    };
  }

  /**
   * Verify webhook signature
   *
   * @param payload - Webhook payload to verify
   * @param signature - Signature to verify against
   * @param secret - Shared secret
   * @param timestamp - Signature timestamp
   * @param toleranceMs - Maximum age tolerance in milliseconds (default: 5 minutes)
   * @returns True if signature is valid
   */
  public verifySignature(
    payload: WebhookPayload,
    signature: string,
    secret: string,
    timestamp: number,
    toleranceMs: number = 300000, // 5 minutes
  ): boolean {
    if (!secret || !signature) {
      return false;
    }

    // Check timestamp tolerance to prevent replay attacks
    const now = Date.now();
    const age = Math.abs(now - timestamp);

    if (age > toleranceMs) {
      throw new WebhookError(
        `Signature timestamp is outside tolerance window (age: ${age}ms, tolerance: ${toleranceMs}ms)`,
        WebhookErrorType.SIGNATURE_ERROR,
        undefined,
        false,
      );
    }

    try {
      const expectedSignature = this.generateSignature(payload, secret, timestamp);
      return this.constantTimeCompare(signature, expectedSignature.signature);
    } catch (error) {
      return false;
    }
  }

  /**
   * Create webhook headers with signature
   *
   * @param payload - Webhook payload
   * @param secret - Shared secret
   * @returns Headers object with signature information
   */
  public createSignatureHeaders(
    payload: WebhookPayload,
    secret: string,
  ): Record<string, string> {
    const signatureInfo = this.generateSignature(payload, secret);

    return {
      'X-Webhook-Signature': signatureInfo.signature,
      'X-Webhook-Timestamp': signatureInfo.timestamp.toString(),
      'X-Webhook-Algorithm': signatureInfo.algorithm,
      'X-Webhook-Event-Type': payload.eventType,
      'X-Webhook-Event-Id': payload.id,
    };
  }

  /**
   * Parse signature headers from incoming webhook
   *
   * @param headers - Request headers
   * @returns Parsed signature information
   */
  public parseSignatureHeaders(headers: Record<string, string>): {
    signature: string;
    timestamp: number;
    algorithm: string;
  } {
    const signature = headers['x-webhook-signature'] || headers['X-Webhook-Signature'];
    const timestampStr = headers['x-webhook-timestamp'] || headers['X-Webhook-Timestamp'];
    const algorithm = headers['x-webhook-algorithm'] || headers['X-Webhook-Algorithm'];

    if (!signature || !timestampStr) {
      throw new WebhookError(
        'Missing required signature headers',
        WebhookErrorType.SIGNATURE_ERROR,
        undefined,
        false,
      );
    }

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) {
      throw new WebhookError(
        'Invalid timestamp in signature headers',
        WebhookErrorType.SIGNATURE_ERROR,
        undefined,
        false,
      );
    }

    return { signature, timestamp, algorithm };
  }

  /**
   * Serialize payload for signing
   *
   * @param payload - Webhook payload
   * @param timestamp - Signature timestamp
   * @returns Serialized string for signing
   */
  private serializePayload(payload: WebhookPayload, timestamp: number): string {
    // Create deterministic string representation
    const signedPayload = {
      id: payload.id,
      eventType: payload.eventType,
      timestamp: payload.timestamp,
      data: payload.data,
      version: payload.version,
    };

    // Combine timestamp and payload for signature
    return `${timestamp}.${JSON.stringify(signedPayload)}`;
  }

  /**
   * Compute HMAC signature
   *
   * @param data - Data to sign
   * @param secret - Shared secret
   * @returns HMAC signature
   */
  private computeHmac(data: string, secret: string): string {
    const hmac = createHmac(this.algorithm, secret);
    hmac.update(data);
    return hmac.digest(this.encoding);
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   *
   * @param a - First string
   * @param b - Second string
   * @returns True if strings are equal
   */
  private constantTimeCompare(a: string, b: string): boolean {
    if (!a || !b || a.length !== b.length) {
      return false;
    }

    try {
      const bufferA = Buffer.from(a, this.encoding);
      const bufferB = Buffer.from(b, this.encoding);

      if (bufferA.length !== bufferB.length) {
        return false;
      }

      return timingSafeEqual(bufferA, bufferB);
    } catch (error) {
      return false;
    }
  }

  /**
   * Rotate secret for a webhook target
   * Generates a new secret and provides grace period for old signatures
   *
   * @param oldSecret - Current secret
   * @param newSecret - New secret
   * @returns Function to verify signatures with either secret
   */
  public createDualSecretVerifier(
    oldSecret: string,
    newSecret: string,
  ): (payload: WebhookPayload, signature: string, timestamp: number) => boolean {
    return (payload: WebhookPayload, signature: string, timestamp: number): boolean => {
      // Try new secret first
      if (this.verifySignature(payload, signature, newSecret, timestamp)) {
        return true;
      }

      // Fall back to old secret during rotation period
      return this.verifySignature(payload, signature, oldSecret, timestamp);
    };
  }

  /**
   * Generate a secure random secret
   *
   * @param length - Length in bytes (default: 32)
   * @returns Hex-encoded random secret
   */
  public static generateSecret(length: number = 32): string {
    const crypto = require('crypto');
    return crypto.randomBytes(length).toString('hex');
  }
}

/**
 * Singleton instance
 */
export const webhookSignatureService = new WebhookSignatureService();
