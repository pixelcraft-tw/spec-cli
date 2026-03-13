# Architecture: MVVM (Flutter)

## Pattern Overview
Flutter app organized into Models, Views, ViewModels, and Services under `lib/`. ViewModels hold UI state and logic; Views are pure widgets that observe ViewModel state.

## Directory Structure
```
lib/
├── models/
│   ├── order.dart
│   └── user.dart
├── views/
│   ├── order_list_view.dart
│   ├── order_detail_view.dart
│   └── widgets/
│       └── order_card.dart
├── viewmodels/
│   ├── order_list_viewmodel.dart
│   └── order_detail_viewmodel.dart
├── services/
│   ├── order_service.dart
│   └── auth_service.dart
├── repositories/
│   ├── order_repository.dart
│   └── user_repository.dart
└── main.dart
test/
├── models/
├── viewmodels/
├── services/
└── repositories/
integration_test/
└── app_test.dart
```

## Responsibility Split
- Models → plain Dart data classes, no framework dependency
- Views → StatelessWidget / HookWidget, render UI from ViewModel state, dispatch user actions to ViewModel
- ViewModels → hold UI state, expose state streams, call Services/Repositories
- Services → API calls, external integrations (HTTP, WebSocket)
- Repositories → data access abstraction over local + remote sources

## Recommended Dependencies
- State Management: Riverpod (StateNotifier / AsyncNotifier)
- Networking: dio
- Navigation: go_router
- Local Storage: drift (SQL), shared_preferences (KV)
- DI: Riverpod (self-contained)

## Conventions
- One ViewModel per screen or major UI section
- ViewModel is a Riverpod Notifier/AsyncNotifier, never a raw ChangeNotifier
- Views read ViewModel via `ref.watch()`; never call Services directly
- Models are immutable (use `freezed` or manual `copyWith`)

## File Naming
- snake_case: order_list_viewmodel.dart
- View: *_view.dart
- ViewModel: *_viewmodel.dart
- Service: *_service.dart
- Repository: *_repository.dart
- Model: descriptive name under models/

## Testing
- Models: pure unit tests
- ViewModels: unit tests with mocked services/repositories
- Services: integration tests or mocked HTTP (dio adapter)
- Views: widget tests with ProviderScope overrides
- integration_test/: full app flow tests
