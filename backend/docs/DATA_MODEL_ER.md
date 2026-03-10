# Модель данных (ER)

Иерархия: **Организация (УК)** → **Жилой комплекс (ЖК)** → **Здание** → **Квартира**. Устройства привязаны к зданию. Пользователи связаны с организацией/ЖК (админы) или с квартирами через привязку (жители).

## Диаграмма сущностей и связей

```mermaid
erDiagram
  organizations ||--o{ residential_complexes : "1:N"
  residential_complexes ||--o{ buildings : "1:N"
  buildings ||--o{ apartments : "1:N"
  buildings ||--o{ devices : "1:N"
  users ||--o{ user_apartments : "1:N"
  apartments ||--o{ user_apartments : "1:N"
  users ||--o| organizations : "N:1 admin"
  users ||--o| residential_complexes : "N:1 manager"
  apartments ||--o{ apartment_applications : "1:N"
  users ||--o{ apartment_applications : "user"
  users ||--o{ apartment_applications : "decided_by"
  devices ||--o{ event_logs : "1:N"

  organizations {
    uuid id PK
    string name
    string subscription_plan
    int max_complexes
    string inn
    string contact_email
    string contact_phone
    int max_devices
    datetime created_at
  }

  residential_complexes {
    uuid id PK
    uuid organization_id FK
    string name
    string address
    string timezone
    json settings
    datetime created_at
  }

  buildings {
    int id PK
    uuid complex_id FK
    string name
    string address
  }

  apartments {
    int id PK
    int building_id FK
    string number
    int floor
  }

  devices {
    int id PK
    int building_id FK
    string name
    string type
    string role
    string host
    int http_port
    int rtsp_port
    string status
    datetime last_seen_at
  }

  users {
    uuid id PK
    string email
    string phone
    string name
    string password_hash
    string role
    uuid organization_id FK
    uuid complex_id FK
    string push_token
    bool is_blocked
    datetime blocked_until
    bool do_not_disturb
  }

  user_apartments {
    uuid user_id PK,FK
    int apartment_id PK,FK
    string role
    int access_level
    datetime valid_until
  }

  apartment_applications {
    int id PK
    uuid user_id FK
    int apartment_id FK
    string status
    datetime requested_at
    uuid decided_by FK
    string reject_reason
  }

  event_logs {
    int id PK
    int device_id FK
    string event_type
    json data
    datetime created_at
  }
```

## Упрощённая иерархия

```
Организация (УК)
  └── Жилой комплекс (ЖК)
        └── Здание
              ├── Квартиры
              └── Устройства (домофоны, камеры)

Пользователи:
  - привязаны к организации/ЖК (роли админов)
  - привязаны к квартирам через user_apartments (жители)
Заявки (apartment_applications): житель → квартира → решение админа.
```

## Роли и доступ к данным

| Роль | Описание | Что видит/редактирует |
|------|----------|------------------------|
| **SUPER_ADMIN** | Суперадмин | Все организации, ЖК, здания, квартиры, устройства, пользователи, заявки. Полный доступ ко всему. |
| **ORG_ADMIN** | Администратор УК | Только свою организацию и все её ЖК, здания, устройства, жителей в этих зданиях. Может создавать менеджеров ЖК. |
| **COMPLEX_MANAGER** | Менеджер ЖК | Только свой жилой комплекс и его здания, квартиры, устройства, жителей. |
| **RESIDENT** | Житель | Только здания, где у пользователя есть привязанные квартиры (через user_apartments); заявки на привязку, настройки «не беспокоить». |

Логика доступа реализована в `AccessService` (`src/access/access.service.ts`): `getAllowableBuildingIds`, `assertCanAccessOrganization`, `assertCanAccessComplex`, `getViewableUserIds`.

## Сущности в коде

| Таблица | Путь к entity |
|---------|----------------|
| organizations | `src/organizations/entities/organization.entity.ts` |
| residential_complexes | `src/residential-complexes/entities/residential-complex.entity.ts` |
| buildings | `src/buildings/entities/building.entity.ts` |
| apartments | `src/apartments/entities/apartment.entity.ts` |
| devices | `src/devices/entities/device.entity.ts` |
| users | `src/users/entities/user.entity.ts` |
| user_apartments | `src/users/entities/user-apartment.entity.ts` |
| apartment_applications | `src/apartments/entities/apartment-application.entity.ts` |
| event_logs | `src/events/entities/event-log.entity.ts` |
