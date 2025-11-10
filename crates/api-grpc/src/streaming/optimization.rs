//! Optimization streaming handlers

use crate::proto::optimization::*;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tonic::Status;
use tracing::debug;

/// Optimization stream manager
#[derive(Debug)]
pub struct OptimizationStreamManager {
    event_subscribers: Vec<mpsc::Sender<Result<OptimizationEvent, Status>>>,
}

impl OptimizationStreamManager {
    /// Create a new optimization stream manager
    pub fn new() -> Self {
        Self {
            event_subscribers: Vec::new(),
        }
    }

    /// Subscribe to optimization events
    pub fn subscribe_events(
        &self,
        decision_ids: Vec<String>,
        status_filter: Vec<i32>,
    ) -> ReceiverStream<Result<OptimizationEvent, Status>> {
        let (tx, rx) = mpsc::channel(100);

        // In production, this would connect to a real event stream
        // For now, spawn a task that sends periodic test events
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(5));

            loop {
                interval.tick().await;

                let event = OptimizationEvent {
                    decision_id: decision_ids.first().cloned().unwrap_or_default(),
                    status: DecisionStatus::Monitoring as i32,
                    message: "Optimization is being monitored".to_string(),
                    timestamp: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
                    metadata: std::collections::HashMap::new(),
                };

                if tx.send(Ok(event)).await.is_err() {
                    debug!("Event stream closed");
                    break;
                }
            }
        });

        ReceiverStream::new(rx)
    }

    /// Create an interactive optimization session
    pub fn create_session(
        &self,
        mut input_stream: tonic::Streaming<OptimizationSessionMessage>,
    ) -> ReceiverStream<Result<OptimizationSessionMessage, Status>> {
        let (tx, rx) = mpsc::channel(100);

        // Handle bidirectional streaming
        tokio::spawn(async move {
            while let Ok(Some(message)) = input_stream.message().await {
                debug!("Received session message: {:?}", message);

                // Process message and send response
                match message.message {
                    Some(optimization_session_message::Message::Query(query)) => {
                        // Generate suggestions based on query
                        let suggestion = OptimizationSuggestion {
                            suggestion_id: uuid::Uuid::new_v4().to_string(),
                            proposed_decision: None,
                            explanation: format!(
                                "Suggestion for services: {:?}",
                                query.target_services
                            ),
                            confidence_score: 0.85,
                            alternatives: vec![],
                        };

                        let response = OptimizationSessionMessage {
                            message: Some(optimization_session_message::Message::Suggestion(
                                suggestion,
                            )),
                        };

                        if tx.send(Ok(response)).await.is_err() {
                            break;
                        }
                    }
                    Some(optimization_session_message::Message::Feedback(feedback)) => {
                        debug!("Received feedback: {:?}", feedback);
                        // Process feedback and potentially adjust suggestions
                    }
                    Some(optimization_session_message::Message::Control(control)) => {
                        debug!("Received control message: {:?}", control);
                        // Handle session control
                    }
                    _ => {}
                }
            }
        });

        ReceiverStream::new(rx)
    }
}

impl Default for OptimizationStreamManager {
    fn default() -> Self {
        Self::new()
    }
}
