/**
 * Jira Integration Client
 * Comprehensive Jira API client for issue tracking and project management
 */

import axios, { AxiosInstance } from 'axios';

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
  timeout?: number;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description: string;
    issuetype: { name: string };
    status: { name: string };
    priority: { name: string };
    assignee?: { displayName: string };
  };
}

export interface CreateIssueRequest {
  summary: string;
  description: string;
  issueType: string;
  priority?: string;
  labels?: string[];
  assignee?: string;
}

/**
 * Jira API client with authentication and error handling
 */
export class JiraClient {
  private client: AxiosInstance;

  constructor(private config: JiraConfig) {
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');

    this.client = axios.create({
      baseURL: `${config.baseUrl}/rest/api/3`,
      timeout: config.timeout || 30000,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Create Jira issue for optimization alert
   */
  async createIssue(request: CreateIssueRequest): Promise<JiraIssue> {
    const payload = {
      fields: {
        project: { key: this.config.projectKey },
        summary: request.summary,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: request.description }],
            },
          ],
        },
        issuetype: { name: request.issueType },
        priority: request.priority ? { name: request.priority } : undefined,
        labels: request.labels || [],
      },
    };

    const response = await this.client.post('/issue', payload);
    return this.getIssue(response.data.key);
  }

  /**
   * Get issue details
   */
  async getIssue(issueKey: string): Promise<JiraIssue> {
    const response = await this.client.get(`/issue/${issueKey}`);
    return response.data;
  }

  /**
   * Add comment to issue
   */
  async addComment(issueKey: string, comment: string): Promise<void> {
    const payload = {
      body: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: comment }],
          },
        ],
      },
    };

    await this.client.post(`/issue/${issueKey}/comment`, payload);
  }

  /**
   * Update issue status
   */
  async updateIssueStatus(issueKey: string, status: string): Promise<void> {
    const transitions = await this.getTransitions(issueKey);
    const transition = transitions.find(t => t.name === status);

    if (!transition) {
      throw new Error(`Status "${status}" not found for issue ${issueKey}`);
    }

    await this.client.post(`/issue/${issueKey}/transitions`, {
      transition: { id: transition.id },
    });
  }

  /**
   * Get available transitions for issue
   */
  async getTransitions(issueKey: string): Promise<Array<{ id: string; name: string }>> {
    const response = await this.client.get(`/issue/${issueKey}/transitions`);
    return response.data.transitions.map((t: any) => ({ id: t.id, name: t.name }));
  }

  /**
   * Search issues with JQL
   */
  async searchIssues(jql: string, maxResults: number = 50): Promise<JiraIssue[]> {
    const response = await this.client.post('/search', {
      jql,
      maxResults,
      fields: ['summary', 'description', 'issuetype', 'status', 'priority', 'assignee'],
    });

    return response.data.issues;
  }
}
