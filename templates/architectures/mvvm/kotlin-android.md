# Architecture: MVVM (Android / Kotlin)

## Pattern Overview
Android app organized into model, ui, viewmodel, and data packages. ViewModels extend `ViewModel()` and expose `StateFlow` to Jetpack Compose screens.

## Directory Structure
```
app/src/main/java/com/example/app/
├── model/
│   ├── Order.kt
│   └── User.kt
├── ui/
│   ├── order/
│   │   ├── OrderListScreen.kt
│   │   └── OrderDetailScreen.kt
│   ├── components/
│   │   └── OrderCard.kt
│   ├── navigation/AppNavigation.kt
│   └── theme/Theme.kt
├── viewmodel/
│   ├── OrderListViewModel.kt
│   └── OrderDetailViewModel.kt
├── data/
│   ├── repository/
│   │   ├── OrderRepository.kt              # interface
│   │   └── OrderRepositoryImpl.kt
│   ├── remote/
│   │   ├── api/OrderApi.kt                 # Retrofit interface
│   │   └── dto/OrderDto.kt
│   └── local/
│       ├── dao/OrderDao.kt                  # Room DAO
│       └── entity/OrderEntity.kt
├── di/
│   ├── AppModule.kt
│   ├── NetworkModule.kt
│   └── DatabaseModule.kt
└── App.kt                                   # Application class
app/src/test/                                 # Unit tests
app/src/androidTest/                          # Instrumented tests
```

## Responsibility Split
- model → plain Kotlin data classes, no Android dependency
- ui → Compose screens and components, observe ViewModel StateFlow, send user actions to ViewModel
- viewmodel → extend `ViewModel()`, hold UI state as `StateFlow`, call Repositories
- data/repository → data access abstraction; interface in repository/, impl calls remote + local
- data/remote → Retrofit API interfaces and DTOs
- data/local → Room DAOs and entities
- di → Hilt modules wiring everything together

## Recommended Dependencies
- DI: Hilt
- Networking: Retrofit + OkHttp
- Local Storage: Room
- Navigation: Navigation Compose
- Async: Kotlin Coroutines + Flow
- State: StateFlow + Compose collectAsStateWithLifecycle

## Conventions
- One ViewModel per screen
- ViewModel exposes `StateFlow<UiState>` via `MutableStateFlow` + `asStateFlow()`
- Screens collect state with `collectAsStateWithLifecycle()`
- Repository interface in data/repository/, implementation calls remote + local sources
- Hilt @Module classes in di/ package

## File Naming
- PascalCase: OrderListViewModel.kt
- Screen: *Screen.kt
- ViewModel: *ViewModel.kt
- Repository interface: *Repository.kt
- Repository impl: *RepositoryImpl.kt
- DAO: *Dao.kt
- API: *Api.kt

## Testing
- model: pure unit tests, JUnit
- viewmodel: unit tests with mocked repositories, Turbine for Flow testing
- data: integration tests with Room in-memory DB
- ui: Compose UI tests with composeTestRule
