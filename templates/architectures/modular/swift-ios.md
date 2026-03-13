# Architecture: Modular (iOS / SwiftUI)

## Directory Structure
```
Sources/
├── Features/
│   ├── Order/
│   │   ├── Views/OrderView.swift
│   │   ├── ViewModels/OrderViewModel.swift
│   │   ├── Models/Order.swift
│   │   ├── Services/OrderService.swift
│   │   └── Navigation/OrderRouter.swift
│   ├── Payment/
│   │   └── ...
│   └── User/
│       └── ...
├── Shared/
│   ├── Networking/APIClient.swift
│   ├── Persistence/SharedDatabase.swift
│   ├── Components/LoadingView.swift
│   └── Extensions/
└── App.swift
Tests/
├── OrderTests/
├── PaymentTests/
└── SharedTests/
```

## Module Boundaries
- Each feature is self-contained with its own Views, ViewModels, Models, Services
- Features communicate via shared protocols or notification/event patterns
- No direct data access across feature boundaries
- Shared/ for truly cross-cutting concerns only

## Recommended Dependencies
- State Management: @Observable (Observation framework)
- Networking: URLSession (built-in)
- Navigation: NavigationStack per feature
- Local Storage: SwiftData (shared)
- DI: Factory pattern

## Conventions
- Feature entry point exposes only its root view and public protocols
- ViewModels use @Observable macro
- NavigationStack scoped per feature with coordinator pattern
- SwiftData models in Shared/ when used across features

## File Naming
- PascalCase: OrderViewModel.swift, OrderView.swift
- One feature = one directory under Features/

## Testing
- Per-feature unit tests with XCTest
- Per-feature UI tests
- Cross-feature integration tests
