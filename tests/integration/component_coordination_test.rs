//! Component coordination integration tests
//!
//! Tests for multi-component coordination, dependency resolution, and communication

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, RwLock};

#[cfg(test)]
mod component_tests {
    use super::*;

    /// Message types for component communication
    #[derive(Debug, Clone, PartialEq)]
    enum Message {
        Start,
        Stop,
        Process(String),
        Result(String),
        Error(String),
    }

    /// Component interface
    #[async_trait::async_trait]
    trait Component: Send + Sync {
        async fn initialize(&self) -> Result<(), String>;
        async fn process(&self, input: String) -> Result<String, String>;
        async fn shutdown(&self) -> Result<(), String>;
        fn name(&self) -> &str;
    }

    /// Mock collector component
    struct CollectorComponent {
        name: String,
        initialized: Arc<RwLock<bool>>,
        collected_count: Arc<Mutex<usize>>,
    }

    impl CollectorComponent {
        fn new(name: String) -> Self {
            Self {
                name,
                initialized: Arc::new(RwLock::new(false)),
                collected_count: Arc::new(Mutex::new(0)),
            }
        }

        async fn get_count(&self) -> usize {
            *self.collected_count.lock().await
        }
    }

    #[async_trait::async_trait]
    impl Component for CollectorComponent {
        async fn initialize(&self) -> Result<(), String> {
            *self.initialized.write().await = true;
            Ok(())
        }

        async fn process(&self, input: String) -> Result<String, String> {
            if !*self.initialized.read().await {
                return Err("Component not initialized".to_string());
            }

            *self.collected_count.lock().await += 1;
            Ok(format!("collected:{}", input))
        }

        async fn shutdown(&self) -> Result<(), String> {
            *self.initialized.write().await = false;
            Ok(())
        }

        fn name(&self) -> &str {
            &self.name
        }
    }

    /// Mock processor component
    struct ProcessorComponent {
        name: String,
        initialized: Arc<RwLock<bool>>,
        processed_count: Arc<Mutex<usize>>,
    }

    impl ProcessorComponent {
        fn new(name: String) -> Self {
            Self {
                name,
                initialized: Arc::new(RwLock::new(false)),
                processed_count: Arc::new(Mutex::new(0)),
            }
        }

        async fn get_count(&self) -> usize {
            *self.processed_count.lock().await
        }
    }

    #[async_trait::async_trait]
    impl Component for ProcessorComponent {
        async fn initialize(&self) -> Result<(), String> {
            *self.initialized.write().await = true;
            Ok(())
        }

        async fn process(&self, input: String) -> Result<String, String> {
            if !*self.initialized.read().await {
                return Err("Component not initialized".to_string());
            }

            *self.processed_count.lock().await += 1;
            Ok(format!("processed:{}", input))
        }

        async fn shutdown(&self) -> Result<(), String> {
            *self.initialized.write().await = false;
            Ok(())
        }

        fn name(&self) -> &str {
            &self.name
        }
    }

    /// Component coordinator
    struct Coordinator {
        components: HashMap<String, Arc<dyn Component>>,
    }

    impl Coordinator {
        fn new() -> Self {
            Self {
                components: HashMap::new(),
            }
        }

        fn register(&mut self, component: Arc<dyn Component>) {
            self.components.insert(component.name().to_string(), component);
        }

        async fn initialize_all(&self) -> Result<(), String> {
            for component in self.components.values() {
                component.initialize().await?;
            }
            Ok(())
        }

        async fn shutdown_all(&self) -> Result<(), String> {
            for component in self.components.values() {
                component.shutdown().await?;
            }
            Ok(())
        }

        async fn process_pipeline(&self, input: String) -> Result<String, String> {
            let mut result = input;

            // Process through collector first
            if let Some(collector) = self.components.get("collector") {
                result = collector.process(result).await?;
            }

            // Then through processor
            if let Some(processor) = self.components.get("processor") {
                result = processor.process(result).await?;
            }

            Ok(result)
        }
    }

    #[tokio::test]
    async fn test_component_registration() {
        let mut coordinator = Coordinator::new();

        let collector = Arc::new(CollectorComponent::new("collector".to_string()));
        let processor = Arc::new(ProcessorComponent::new("processor".to_string()));

        coordinator.register(collector);
        coordinator.register(processor);

        assert_eq!(coordinator.components.len(), 2);
        assert!(coordinator.components.contains_key("collector"));
        assert!(coordinator.components.contains_key("processor"));
    }

    #[tokio::test]
    async fn test_component_initialization() {
        let mut coordinator = Coordinator::new();

        let collector = Arc::new(CollectorComponent::new("collector".to_string()));
        coordinator.register(collector.clone());

        coordinator
            .initialize_all()
            .await
            .expect("Should initialize all components");

        assert!(*collector.initialized.read().await);
    }

    #[tokio::test]
    async fn test_pipeline_processing() {
        let mut coordinator = Coordinator::new();

        let collector = Arc::new(CollectorComponent::new("collector".to_string()));
        let processor = Arc::new(ProcessorComponent::new("processor".to_string()));

        coordinator.register(collector.clone());
        coordinator.register(processor.clone());

        coordinator
            .initialize_all()
            .await
            .expect("Should initialize all");

        let result = coordinator
            .process_pipeline("test_data".to_string())
            .await
            .expect("Should process through pipeline");

        assert_eq!(result, "processed:collected:test_data");
        assert_eq!(collector.get_count().await, 1);
        assert_eq!(processor.get_count().await, 1);
    }

    #[tokio::test]
    async fn test_component_communication() {
        let (tx, mut rx) = mpsc::channel::<Message>(10);

        // Spawn sender task
        let sender = tokio::spawn(async move {
            tx.send(Message::Process("data1".to_string()))
                .await
                .expect("Should send");
            tx.send(Message::Process("data2".to_string()))
                .await
                .expect("Should send");
            tx.send(Message::Stop).await.expect("Should send");
        });

        // Receive messages
        let mut received = Vec::new();
        while let Some(msg) = rx.recv().await {
            if msg == Message::Stop {
                break;
            }
            received.push(msg);
        }

        sender.await.expect("Sender should complete");

        assert_eq!(received.len(), 2);
    }

    #[tokio::test]
    async fn test_component_error_handling() {
        let mut coordinator = Coordinator::new();
        let collector = Arc::new(CollectorComponent::new("collector".to_string()));

        coordinator.register(collector.clone());

        // Try to process without initialization
        let result = coordinator.process_pipeline("test".to_string()).await;

        assert!(result.is_err(), "Should fail without initialization");
    }

    #[tokio::test]
    async fn test_concurrent_component_access() {
        let collector = Arc::new(CollectorComponent::new("collector".to_string()));
        collector.initialize().await.expect("Should initialize");

        let handles: Vec<_> = (0..10)
            .map(|i| {
                let c = collector.clone();
                tokio::spawn(async move { c.process(format!("data{}", i)).await })
            })
            .collect();

        for handle in handles {
            handle.await.expect("Task should complete").expect("Should process");
        }

        assert_eq!(collector.get_count().await, 10);
    }

    #[tokio::test]
    async fn test_component_shutdown_cleanup() {
        let mut coordinator = Coordinator::new();

        let collector = Arc::new(CollectorComponent::new("collector".to_string()));
        coordinator.register(collector.clone());

        coordinator.initialize_all().await.expect("Should initialize");
        assert!(*collector.initialized.read().await);

        coordinator.shutdown_all().await.expect("Should shutdown");
        assert!(!*collector.initialized.read().await);
    }

    #[tokio::test]
    async fn test_component_dependency_resolution() {
        // Collector must be initialized before processor
        let collector = Arc::new(CollectorComponent::new("collector".to_string()));
        let processor = Arc::new(ProcessorComponent::new("processor".to_string()));

        // Initialize in order
        collector.initialize().await.expect("Collector should init");
        processor.initialize().await.expect("Processor should init");

        // Process through both
        let result1 = collector.process("test".to_string()).await.expect("Should collect");
        let result2 = processor.process(result1).await.expect("Should process");

        assert_eq!(result2, "processed:collected:test");
    }

    #[tokio::test]
    async fn test_high_throughput_coordination() {
        let mut coordinator = Coordinator::new();

        let collector = Arc::new(CollectorComponent::new("collector".to_string()));
        let processor = Arc::new(ProcessorComponent::new("processor".to_string()));

        coordinator.register(collector.clone());
        coordinator.register(processor.clone());

        coordinator.initialize_all().await.expect("Should initialize");

        // Process 1000 items
        for i in 0..1000 {
            coordinator
                .process_pipeline(format!("item{}", i))
                .await
                .expect("Should process");
        }

        assert_eq!(collector.get_count().await, 1000);
        assert_eq!(processor.get_count().await, 1000);
    }
}

#[cfg(test)]
mod event_bus_tests {
    use super::*;
    use std::time::Duration;

    /// Event bus for component communication
    struct EventBus {
        subscribers: Arc<Mutex<HashMap<String, Vec<mpsc::Sender<Message>>>>>,
    }

    impl EventBus {
        fn new() -> Self {
            Self {
                subscribers: Arc::new(Mutex::new(HashMap::new())),
            }
        }

        async fn subscribe(&self, topic: String) -> mpsc::Receiver<Message> {
            let (tx, rx) = mpsc::channel(100);
            let mut subs = self.subscribers.lock().await;
            subs.entry(topic).or_insert_with(Vec::new).push(tx);
            rx
        }

        async fn publish(&self, topic: String, message: Message) {
            let subs = self.subscribers.lock().await;
            if let Some(channels) = subs.get(&topic) {
                for tx in channels {
                    let _ = tx.send(message.clone()).await;
                }
            }
        }
    }

    #[tokio::test]
    async fn test_event_bus_publish_subscribe() {
        let bus = EventBus::new();

        let mut rx = bus.subscribe("test_topic".to_string()).await;

        bus.publish("test_topic".to_string(), Message::Process("data".to_string()))
            .await;

        let received = tokio::time::timeout(Duration::from_secs(1), rx.recv())
            .await
            .expect("Should receive within timeout")
            .expect("Should have message");

        assert_eq!(received, Message::Process("data".to_string()));
    }

    #[tokio::test]
    async fn test_multiple_subscribers() {
        let bus = EventBus::new();

        let mut rx1 = bus.subscribe("topic".to_string()).await;
        let mut rx2 = bus.subscribe("topic".to_string()).await;
        let mut rx3 = bus.subscribe("topic".to_string()).await;

        bus.publish("topic".to_string(), Message::Process("broadcast".to_string()))
            .await;

        let msg1 = rx1.recv().await.expect("Subscriber 1 should receive");
        let msg2 = rx2.recv().await.expect("Subscriber 2 should receive");
        let msg3 = rx3.recv().await.expect("Subscriber 3 should receive");

        assert_eq!(msg1, Message::Process("broadcast".to_string()));
        assert_eq!(msg2, Message::Process("broadcast".to_string()));
        assert_eq!(msg3, Message::Process("broadcast".to_string()));
    }

    #[tokio::test]
    async fn test_topic_isolation() {
        let bus = EventBus::new();

        let mut rx1 = bus.subscribe("topic1".to_string()).await;
        let mut rx2 = bus.subscribe("topic2".to_string()).await;

        bus.publish("topic1".to_string(), Message::Process("msg1".to_string()))
            .await;

        let msg1 = rx1.recv().await.expect("Should receive on topic1");

        // topic2 should not receive
        let result = tokio::time::timeout(Duration::from_millis(100), rx2.recv()).await;
        assert!(result.is_err(), "topic2 should not receive topic1 messages");

        assert_eq!(msg1, Message::Process("msg1".to_string()));
    }
}
