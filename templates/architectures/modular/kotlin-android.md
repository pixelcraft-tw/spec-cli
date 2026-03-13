# Architecture: Modular (Android / Kotlin)

## Directory Structure
```
:app/                                          # Application module
├── src/main/java/com/example/app/
│   ├── navigation/AppNavigation.kt
│   ├── di/AppModule.kt
│   └── App.kt
:feature:order/
├── src/main/java/com/example/feature/order/
│   ├── ui/
│   │   ├── OrderScreen.kt
│   │   └── OrderViewModel.kt
│   ├── domain/
│   │   ├── Order.kt
│   │   └── OrderUseCase.kt
│   ├── data/
│   │   ├── OrderRepository.kt
│   │   └── OrderApi.kt
│   └── di/OrderModule.kt
:feature:payment/
│   └── ...
:feature:user/
│   └── ...
:core:network/
├── src/main/java/com/example/core/network/
│   ├── ApiClient.kt
│   └── di/NetworkModule.kt
:core:database/
├── src/main/java/com/example/core/database/
│   ├── AppDatabase.kt
│   └── di/DatabaseModule.kt
:core:ui/
├── src/main/java/com/example/core/ui/
│   ├── theme/Theme.kt
│   └── components/LoadingIndicator.kt
```

## Module Boundaries
- Each :feature:* module is self-contained with ui, domain, data layers
- Features depend on :core:* modules but never on other features
- Inter-feature navigation via Navigation Compose nested graphs
- :core:* modules provide shared infrastructure

## Recommended Dependencies
- State Management: Hilt + StateFlow + Compose State
- Networking: Retrofit + OkHttp (in :core:network)
- DI: Hilt (per-module @Module)
- Navigation: Navigation Compose (nested graphs per feature)
- Local Storage: Room (in :core:database)
- Async: Kotlin Coroutines + Flow

## Conventions
- Feature modules expose only their navigation graph entry point
- Hilt @Module scoped per feature module
- Navigation Compose nested NavGraph per feature
- Room database in :core:database, DAOs accessible via DI

## File Naming
- PascalCase: OrderViewModel.kt, OrderScreen.kt
- One feature = one Gradle module under :feature:*
- Core modules under :core:*

## Testing
- Per-feature unit tests
- Per-feature Compose UI tests
- Cross-feature E2E tests in :app
