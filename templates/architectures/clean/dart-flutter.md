# Architecture: Clean Architecture (Flutter)

## Layer-Based Structure
Flutter app organized into domain, application, infrastructure, and presentation layers under `lib/`.

## Directory Structure
```
lib/
├── domain/
│   ├── entities/order.dart
│   ├── value_objects/money.dart
│   └── errors/domain_error.dart
├── application/
│   ├── use_cases/create_order_use_case.dart
│   ├── ports/
│   │   ├── order_repository_port.dart
│   │   └── payment_gateway_port.dart
│   └── dtos/create_order_dto.dart
├── infrastructure/
│   ├── repositories/order_repository.dart
│   ├── services/payment_gateway.dart
│   ├── database/
│   │   └── app_database.dart
│   └── config/env.dart
├── presentation/
│   ├── pages/order_page.dart
│   ├── widgets/order_card.dart
│   ├── providers/order_provider.dart
│   └── router/app_router.dart
└── main.dart
test/
├── domain/
├── application/
├── infrastructure/
└── presentation/
integration_test/
└── app_test.dart
```

## Dependency Rule
- domain → depends on nothing outside, pure Dart classes
- application → depends only on domain; use cases call externals via port abstract classes
- infrastructure → implements application ports
- presentation → depends on application; widgets + providers

## Recommended Dependencies
- State Management: Riverpod + flutter_hooks
- Networking: dio + retrofit
- Navigation: go_router
- Local Storage: drift (SQL), shared_preferences (KV)
- DI: Riverpod (self-contained)

## Conventions
- Use Cases are single-purpose classes with a `call()` method
- Providers (Riverpod) expose use cases and state to UI
- Presentation layer never imports infrastructure directly
- Error handling via Either pattern or sealed result classes

## File Naming
- snake_case: create_order_use_case.dart
- Entity: *_entity.dart or just *.dart under entities/
- Port: *_port.dart
- Repository: *_repository.dart
- Provider: *_provider.dart
- Page: *_page.dart
- Widget: *_widget.dart or descriptive name

## Testing
- domain: pure unit tests, no mocks
- application: mock ports
- infrastructure: integration tests
- presentation: widget tests with WidgetTester
- integration_test/: full app flow tests
