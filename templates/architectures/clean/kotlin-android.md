# Architecture: Clean Architecture (Android / Kotlin)

## Layer-Based Structure
Android app organized into domain, data, and presentation packages following Clean Architecture with Jetpack Compose.

## Directory Structure
```
app/src/main/java/com/example/app/
├── domain/
│   ├── model/Order.kt
│   ├── repository/OrderRepository.kt          # interface
│   ├── usecase/CreateOrderUseCase.kt
│   └── error/DomainError.kt
├── data/
│   ├── repository/OrderRepositoryImpl.kt
│   ├── remote/
│   │   ├── api/OrderApi.kt                    # Retrofit interface
│   │   └── dto/OrderDto.kt
│   ├── local/
│   │   ├── dao/OrderDao.kt                    # Room DAO
│   │   └── entity/OrderEntity.kt
│   └── mapper/OrderMapper.kt
├── presentation/
│   ├── order/
│   │   ├── OrderScreen.kt
│   │   └── OrderViewModel.kt
│   ├── navigation/AppNavigation.kt
│   └── theme/Theme.kt
├── di/
│   ├── AppModule.kt
│   ├── NetworkModule.kt
│   └── DatabaseModule.kt
└── App.kt                                     # Application class
app/src/test/                                   # Unit tests
app/src/androidTest/                            # Instrumented tests
```

## Dependency Rule
- domain → depends on nothing outside, pure Kotlin classes + interfaces
- data → implements domain repository interfaces
- presentation → depends on domain; Compose screens + ViewModels
- di → wires everything together via Hilt modules

## Recommended Dependencies
- State Management: Hilt + StateFlow + Compose State
- Networking: Retrofit + OkHttp
- DI: Hilt
- Navigation: Navigation Compose
- Local Storage: Room
- Async: Kotlin Coroutines + Flow

## Conventions
- Use Cases are single-purpose classes with an `operator fun invoke()` or `execute()` method
- ViewModels extend `ViewModel()`, expose `StateFlow` to Compose
- Repository interfaces live in domain, implementations in data
- Hilt @Module classes in di/ package

## File Naming
- PascalCase: CreateOrderUseCase.kt
- Interface: OrderRepository.kt (domain), OrderRepositoryImpl.kt (data)
- DAO: *Dao.kt
- API: *Api.kt
- Screen: *Screen.kt
- ViewModel: *ViewModel.kt

## Testing
- domain: pure unit tests, JUnit
- data: integration tests with Room in-memory DB
- presentation: Compose UI tests with composeTestRule
- Use Cases: unit test with mock repositories
