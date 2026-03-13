# Architecture: Modular (Flutter)

## Directory Structure
```
lib/
├── features/
│   ├── order/
│   │   ├── data/
│   │   │   ├── order_repository.dart
│   │   │   └── order_api.dart
│   │   ├── domain/
│   │   │   └── order.dart
│   │   ├── presentation/
│   │   │   ├── order_page.dart
│   │   │   ├── order_provider.dart
│   │   │   └── widgets/order_card.dart
│   │   └── order_module.dart
│   ├── payment/
│   │   └── ...
│   └── user/
│       └── ...
├── shared/
│   ├── database/app_database.dart
│   ├── networking/dio_client.dart
│   ├── widgets/loading_indicator.dart
│   └── providers/shared_providers.dart
├── router/app_router.dart
└── main.dart
test/
├── features/
│   ├── order/
│   └── payment/
└── shared/
integration_test/
└── app_test.dart
```

## Module Boundaries
- Each feature is self-contained with its own data, domain, presentation layers
- Features communicate via Riverpod providers or explicit public APIs
- No direct data access across feature boundaries
- shared/ for truly cross-cutting concerns only

## Recommended Dependencies
- State Management: Riverpod (per-feature scope)
- Networking: dio
- Navigation: go_router (nested routing per feature)
- Local Storage: drift (per-feature DB or shared)
- DI: Riverpod (self-contained)

## Conventions
- Feature module entry point exports only its public API (providers, routes)
- Inter-feature communication via shared providers or event streams
- Each feature owns its own data models and repositories
- go_router ShellRoute per feature for nested navigation

## File Naming
- snake_case: order_repository.dart, order_page.dart
- One feature = one directory under features/

## Testing
- Per-feature unit tests
- Per-feature widget tests
- Cross-feature integration tests in integration_test/
