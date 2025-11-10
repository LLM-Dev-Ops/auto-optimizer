//! Jira API type definitions
//!
//! This module provides comprehensive type definitions for Jira REST API v3.
//! All types include Serde serialization/deserialization support.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Jira authentication configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum JiraAuth {
    /// OAuth 2.0 authentication
    OAuth2 {
        /// OAuth client ID
        client_id: String,
        /// OAuth client secret
        client_secret: String,
        /// OAuth access token
        access_token: String,
        /// OAuth refresh token
        refresh_token: Option<String>,
    },
    /// Basic authentication with email and API token
    Basic {
        /// User email address
        email: String,
        /// API token
        api_token: String,
    },
    /// Personal Access Token (PAT)
    PersonalAccessToken {
        /// PAT token
        token: String,
    },
}

/// Jira client configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraConfig {
    /// Jira instance base URL (e.g., https://your-domain.atlassian.net)
    pub base_url: String,
    /// Authentication configuration
    pub auth: JiraAuth,
    /// Request timeout in seconds
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
    /// Maximum retry attempts
    #[serde(default = "default_max_retries")]
    pub max_retries: u32,
    /// Rate limit: requests per minute
    #[serde(default = "default_rate_limit")]
    pub rate_limit_per_minute: u32,
}

fn default_timeout() -> u64 {
    30
}

fn default_max_retries() -> u32 {
    3
}

fn default_rate_limit() -> u32 {
    100
}

/// Jira issue representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Issue {
    /// Issue ID
    pub id: String,
    /// Issue key (e.g., PROJ-123)
    pub key: String,
    /// Issue fields
    pub fields: IssueFields,
    /// Issue self URL
    #[serde(rename = "self")]
    pub self_url: String,
}

/// Jira issue fields
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueFields {
    /// Issue summary
    pub summary: String,
    /// Issue description
    pub description: Option<String>,
    /// Issue type
    #[serde(rename = "issuetype")]
    pub issue_type: IssueType,
    /// Issue status
    pub status: Status,
    /// Issue priority
    pub priority: Option<Priority>,
    /// Assignee
    pub assignee: Option<User>,
    /// Reporter
    pub reporter: Option<User>,
    /// Project
    pub project: Project,
    /// Labels
    #[serde(default)]
    pub labels: Vec<String>,
    /// Components
    #[serde(default)]
    pub components: Vec<Component>,
    /// Created timestamp
    pub created: String,
    /// Updated timestamp
    pub updated: String,
    /// Custom fields
    #[serde(flatten)]
    pub custom_fields: HashMap<String, serde_json::Value>,
}

/// Issue type
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueType {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

/// Issue status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Status {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    #[serde(rename = "statusCategory")]
    pub status_category: StatusCategory,
}

/// Status category
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusCategory {
    pub id: i32,
    pub key: String,
    pub name: String,
    #[serde(rename = "colorName")]
    pub color_name: String,
}

/// Issue priority
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Priority {
    pub id: String,
    pub name: String,
    #[serde(rename = "iconUrl")]
    pub icon_url: Option<String>,
}

/// Jira user
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    #[serde(rename = "accountId")]
    pub account_id: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    #[serde(rename = "emailAddress")]
    pub email_address: Option<String>,
    pub active: bool,
}

/// Jira project
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub key: String,
    pub name: String,
    pub description: Option<String>,
    #[serde(rename = "projectTypeKey")]
    pub project_type_key: String,
}

/// Jira component
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Component {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

/// Create issue request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateIssueRequest {
    pub fields: CreateIssueFields,
}

/// Create issue fields
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateIssueFields {
    pub project: ProjectRef,
    pub summary: String,
    pub description: Option<String>,
    #[serde(rename = "issuetype")]
    pub issue_type: IssueTypeRef,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee: Option<UserRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<PriorityRef>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub labels: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub components: Vec<ComponentRef>,
}

/// Project reference (for creating issues)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectRef {
    pub key: String,
}

/// Issue type reference
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueTypeRef {
    pub name: String,
}

/// User reference
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserRef {
    #[serde(rename = "accountId")]
    pub account_id: String,
}

/// Priority reference
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriorityRef {
    pub name: String,
}

/// Component reference
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentRef {
    pub name: String,
}

/// Update issue request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateIssueRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<HashMap<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update: Option<HashMap<String, Vec<UpdateOperation>>>,
}

/// Update operation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "operation", content = "value")]
pub enum UpdateOperation {
    #[serde(rename = "add")]
    Add(serde_json::Value),
    #[serde(rename = "set")]
    Set(serde_json::Value),
    #[serde(rename = "remove")]
    Remove(serde_json::Value),
}

/// JQL search request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JqlSearchRequest {
    /// JQL query string
    pub jql: String,
    /// Starting index (pagination)
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "startAt")]
    pub start_at: Option<u32>,
    /// Maximum results per page
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "maxResults")]
    pub max_results: Option<u32>,
    /// Fields to include in response
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<Vec<String>>,
}

/// JQL search response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JqlSearchResponse {
    /// Total number of issues matching the query
    pub total: u32,
    /// Starting index
    #[serde(rename = "startAt")]
    pub start_at: u32,
    /// Maximum results
    #[serde(rename = "maxResults")]
    pub max_results: u32,
    /// Issues in this page
    pub issues: Vec<Issue>,
}

/// Board information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Board {
    pub id: u64,
    pub name: String,
    #[serde(rename = "type")]
    pub board_type: String,
    #[serde(rename = "self")]
    pub self_url: String,
}

/// Sprint information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sprint {
    pub id: u64,
    pub name: String,
    pub state: String,
    #[serde(rename = "startDate")]
    pub start_date: Option<String>,
    #[serde(rename = "endDate")]
    pub end_date: Option<String>,
    #[serde(rename = "originBoardId")]
    pub origin_board_id: u64,
}

/// Webhook event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookEvent {
    /// Event timestamp
    pub timestamp: i64,
    /// Event type (e.g., "jira:issue_created", "jira:issue_updated")
    #[serde(rename = "webhookEvent")]
    pub webhook_event: String,
    /// Issue event type for issue events
    #[serde(rename = "issue_event_type_name")]
    pub issue_event_type_name: Option<String>,
    /// User who triggered the event
    pub user: Option<User>,
    /// Issue data
    pub issue: Option<Issue>,
    /// Changelog for update events
    pub changelog: Option<Changelog>,
}

/// Changelog
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Changelog {
    pub id: String,
    pub items: Vec<ChangelogItem>,
}

/// Changelog item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangelogItem {
    pub field: String,
    #[serde(rename = "fieldtype")]
    pub field_type: String,
    #[serde(rename = "fieldId")]
    pub field_id: Option<String>,
    pub from: Option<String>,
    #[serde(rename = "fromString")]
    pub from_string: Option<String>,
    pub to: Option<String>,
    #[serde(rename = "toString")]
    pub to_string: Option<String>,
}

/// API error response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorResponse {
    #[serde(rename = "errorMessages")]
    pub error_messages: Vec<String>,
    pub errors: HashMap<String, String>,
}

/// Rate limit info
#[derive(Debug, Clone)]
pub struct RateLimitInfo {
    /// Remaining requests in current window
    pub remaining: u32,
    /// Total requests allowed per window
    pub limit: u32,
    /// Time when rate limit resets (Unix timestamp)
    pub reset_at: i64,
}
