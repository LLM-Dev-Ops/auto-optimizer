import * as crypto from 'crypto';
import { SlackWebhookProcessor } from '../src/integrations/slack/slack-webhooks';

describe('Slack signature boundary', () => {
  const signingSecret = 'synthetic-boundary-fixture';
  const body = JSON.stringify({ type: 'url_verification', challenge: 'fixture' });
  const timestamp = () => String(Math.floor(Date.now() / 1000));
  const sign = (time: string) => 'v0=' + crypto.createHmac('sha256', signingSecret).update(`v0:${time}:${body}`).digest('hex');
  const processor = new SlackWebhookProcessor({ signingSecret });

  test.each(['', 'v0=short', 'v0=' + '0'.repeat(65), 'v0=' + 'é'.repeat(64)])('malformed signature %p fails closed without throwing', signature => {
    expect(processor.verifySignature({ headers: {}, signature, timestamp: timestamp(), body }).valid).toBe(false);
  });
  test.each(['NaN', 'not-a-time', 'Infinity', '9007199254740992'])('signed malformed timestamp %p is rejected', time => {
    expect(processor.verifySignature({ headers: {}, signature: sign(time), timestamp: time, body }).valid).toBe(false);
  });
  test('signed numeric prefix does not permit a timestamp suffix', () => {
    const time = timestamp() + 'junk';
    expect(processor.verifySignature({ headers: {}, signature: sign(time), timestamp: time, body }).valid).toBe(false);
  });
  test('invalid request uses the established typed processing rejection', async () => {
    await expect(processor.processWebhook({ headers: {}, signature: '', timestamp: timestamp(), body })).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
  });
  test('valid authenticated challenge remains accepted', async () => {
    const time = timestamp();
    await expect(processor.processWebhook({ headers: {}, signature: sign(time), timestamp: time, body })).resolves.toEqual({ challenge: 'fixture' });
  });
});
