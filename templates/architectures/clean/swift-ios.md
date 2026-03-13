# Architecture: Clean Architecture (iOS / SwiftUI)

## Layer-Based Structure
iOS app organized into Domain, Application, Infrastructure, and Presentation groups following Clean Architecture principles.

## Directory Structure
```
Sources/
├── Domain/
│   ├── Entities/Order.swift
│   ├── ValueObjects/Money.swift
│   └── Errors/DomainError.swift
├── Application/
│   ├── UseCases/CreateOrderUseCase.swift
│   ├── Ports/
│   │   ├── OrderRepositoryPort.swift
│   │   └── PaymentGatewayPort.swift
│   └── DTOs/CreateOrderDTO.swift
├── Infrastructure/
│   ├── Repositories/OrderRepository.swift
│   ├── Services/PaymentGateway.swift
│   ├── Networking/APIClient.swift
│   └── Persistence/
│       └── SwiftDataModels.swift
├── Presentation/
│   ├── Views/OrderView.swift
│   ├── ViewModels/OrderViewModel.swift
│   ├── Navigation/AppRouter.swift
│   └── Components/OrderCard.swift
└── App.swift
Tests/
├── DomainTests/
├── ApplicationTests/
├── InfrastructureTests/
└── PresentationTests/
```

## Dependency Rule
- Domain → depends on nothing outside, pure Swift types
- Application → depends only on Domain; use cases call externals via protocol ports
- Infrastructure → implements Application ports (protocols)
- Presentation → depends on Application; SwiftUI views + @Observable ViewModels

## Recommended Dependencies
- State Management: @Observable (Observation framework, built-in)
- Networking: URLSession (built-in)
- Navigation: NavigationStack (SwiftUI native)
- Local Storage: SwiftData
- DI: Factory pattern or manual injection

## Conventions
- Use Cases are structs/classes with a `execute()` method
- ViewModels use @Observable macro, observed by SwiftUI views
- Protocols define port boundaries between layers
- Errors modeled as enums conforming to Error protocol

## File Naming
- PascalCase: CreateOrderUseCase.swift
- Entity: *.swift under Entities/
- Port: *Port.swift (protocol)
- Repository: *Repository.swift
- ViewModel: *ViewModel.swift
- View: *View.swift

## Testing
- Domain: pure unit tests, XCTest
- Application: mock ports with protocol conformance
- Infrastructure: integration tests
- Presentation: ViewInspector or snapshot tests
