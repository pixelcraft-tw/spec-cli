# Architecture: MVVM (iOS / SwiftUI)

## Pattern Overview
iOS app organized into Models, Views, ViewModels, and Services under `Sources/`. ViewModels use @Observable macro to drive SwiftUI views via data binding.

## Directory Structure
```
Sources/
├── Models/
│   ├── Order.swift
│   └── User.swift
├── Views/
│   ├── OrderListView.swift
│   ├── OrderDetailView.swift
│   └── Components/
│       └── OrderCard.swift
├── ViewModels/
│   ├── OrderListViewModel.swift
│   └── OrderDetailViewModel.swift
├── Services/
│   ├── OrderService.swift
│   └── AuthService.swift
├── Repositories/
│   ├── OrderRepository.swift
│   └── UserRepository.swift
└── App.swift
Tests/
├── ModelsTests/
├── ViewModelsTests/
├── ServicesTests/
└── RepositoriesTests/
```

## Responsibility Split
- Models → plain Swift structs/enums, Codable
- Views → SwiftUI views, observe ViewModel properties, send user actions to ViewModel
- ViewModels → @Observable classes, hold UI state, call Services/Repositories
- Services → network requests (URLSession), external integrations
- Repositories → data access abstraction over local + remote sources

## Recommended Dependencies
- State Management: @Observable (Observation framework, built-in)
- Networking: URLSession (built-in)
- Navigation: NavigationStack (SwiftUI native)
- Local Storage: SwiftData
- DI: Factory pattern or manual injection via init

## Conventions
- One ViewModel per screen or major UI section
- ViewModel is an @Observable class; Views observe it directly
- Views never import Services or Repositories
- Models are value types (structs) where possible

## File Naming
- PascalCase: OrderListViewModel.swift
- View: *View.swift
- ViewModel: *ViewModel.swift
- Service: *Service.swift
- Repository: *Repository.swift
- Model: descriptive name under Models/

## Testing
- Models: pure unit tests, XCTest
- ViewModels: unit tests with mocked services/repositories
- Services: integration tests or URLProtocol mocking
- Views: ViewInspector or snapshot tests
