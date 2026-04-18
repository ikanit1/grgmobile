# Admin Panel — Design System Spec
**Дата:** 2026-04-19
**Источники:** `docs/tokens.css`, `docs/index (1).html`
**Файл:** `backend/public/admin.html`

---

## Цель

Привести веб-админку в соответствие с единой дизайн-системой GRG. Подключить canonical `tokens.css`, добавить glassmorphism-поверхности, ambient-фон, обновить сайдбар, кнопки, формы, таблицы и badges.

---

## Файловая карта

| Действие | Файл | Ответственность |
|----------|------|----------------|
| Create | `backend/public/styles/tokens.css` | Копия `docs/tokens.css` — единый источник CSS-токенов |
| Modify | `backend/public/admin.html` | Полный редизайн по пунктам ниже |

---

## 1. Токены — подключение через `<link>`

Убрать из `<style>` все локальные CSS-переменные (`--bg`, `--sidebar-bg`, `--card`, `--card-solid`, `--border`, `--border-hard`, `--text`, `--muted`, `--accent`, `--accent-light`, `--accent-dim`, `--success`, `--error`, `--warning`, `--dur-fast`, `--ease`).

Добавить в `<head>` после font-preconnect:
```html
<link rel="stylesheet" href="/styles/tokens.css">
```

NestJS сервирует `backend/public/` как статику — папка `styles/` подхватится автоматически без изменений в конфиге.

### Маппинг старых переменных → новых токенов

| Старое | Новое |
|--------|-------|
| `--bg` | `--grg-ink-950` |
| `--sidebar-bg` | `--grg-ink-900` |
| `--card` | `--grg-glass-base` |
| `--card-solid` | `--grg-ink-800` |
| `--border` | `--grg-glass-border` |
| `--border-hard` | `--grg-ink-700` |
| `--text` | `--grg-ink-100` |
| `--muted` | `--grg-ink-300` |
| `--accent` | `--grg-purple-500` |
| `--accent-light` | `--grg-purple-300` |
| `--accent-dim` | `--grg-purple-600` |
| `--success` | `--grg-success` |
| `--error` | `--grg-danger` |
| `--warning` | `--grg-warning` |
| `--dur-fast` | `--grg-dur-fast` |
| `--ease` | `--grg-ease` |

---

## 2. Body — ambient-градиентный фон

```html
<body class="grg-bg">
```

Убрать `background: var(--bg)` из `body {}` в `<style>` — класс `.grg-bg` определён в `tokens.css` и добавляет три слоя radial/linear-градиентов.

---

## 3. Sidebar — glassmorphism + логотип

### Новые стили `.sidebar`
```css
.sidebar {
  background: rgba(10, 4, 24, 0.70);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border-right: 1px solid var(--grg-glass-border);
}
```

### Логотип в `.sidebar-brand`
Добавить элемент `.brand-logo` перед `.brand-name`:
```html
<div class="brand-logo"></div>
```

```css
.brand-logo {
  width: 32px; height: 32px; border-radius: 9px; flex-shrink: 0;
  background: conic-gradient(from 210deg, #8A2BE2, #5FA8FF, #8A2BE2);
  box-shadow: 0 0 0 1px rgba(138,43,226,.4), 0 6px 18px -6px rgba(138,43,226,.6);
  position: relative;
}
.brand-logo::after {
  content: ""; position: absolute; inset: 5px;
  border-radius: 5px; background: var(--grg-ink-950);
}
.brand-logo::before {
  content: ""; position: absolute; inset: 9px; border-radius: 2px;
  background: linear-gradient(180deg, #8A2BE2, #5FA8FF); z-index: 1;
}
```

`.sidebar-brand` сделать `display: flex; align-items: center; gap: 10px`.

### Nav-пункты `.sidebar-nav-item`
```css
.sidebar-nav-item {
  border-radius: 9px;
  border-left: none;            /* убрать старый border-left indikator */
  padding: 8px 10px;
  color: var(--grg-ink-200);
}
.sidebar-nav-item:hover {
  background: rgba(138, 43, 226, 0.10);
  color: #fff;
}
.sidebar-nav-item.active {
  background: rgba(138, 43, 226, 0.20);
  color: #fff;
  border-left: none;
}
```

Добавить точку-индикатор `.nav-dot` перед иконкой:
```html
<span class="nav-dot"></span>
```
```css
.nav-dot {
  width: 6px; height: 6px; border-radius: 99px;
  background: var(--grg-ink-700); flex-shrink: 0;
}
.sidebar-nav-item.active .nav-dot {
  background: var(--grg-purple-500);
  box-shadow: 0 0 6px var(--grg-purple-500);
}
```

---

## 4. Карточки `.card`

```css
.card {
  background: var(--grg-glass-base);
  border: 1px solid var(--grg-glass-border);
  border-radius: var(--grg-r-lg);           /* 16px */
  backdrop-filter: blur(var(--grg-blur-md)) saturate(140%);
  -webkit-backdrop-filter: blur(var(--grg-blur-md)) saturate(140%);
  position: relative; overflow: hidden;
}
.card::before {
  content: ""; position: absolute;
  top: 0; left: 16px; right: 16px; height: 1px;
  background: rgba(255, 255, 255, 0.07);
}
```

---

## 5. Кнопки

### Основная `button`
```css
button {
  background: linear-gradient(135deg, var(--grg-purple-500), var(--grg-purple-600));
  box-shadow: 0 4px 14px -4px rgba(138, 43, 226, 0.60);
  border-radius: var(--grg-r-sm);           /* 8px */
  transition: box-shadow var(--grg-dur-fast) var(--grg-ease),
              background var(--grg-dur-fast) var(--grg-ease);
}
button:hover {
  background: linear-gradient(135deg, var(--grg-purple-600), var(--grg-purple-700));
  box-shadow: 0 6px 20px -4px rgba(138, 43, 226, 0.75);
}
```

### Secondary `button.secondary`
```css
button.secondary {
  background: transparent;
  border: 1px solid var(--grg-glass-border);
  color: var(--grg-ink-300);
  box-shadow: none;
}
button.secondary:hover {
  color: #fff;
  border-color: var(--grg-purple-500);
}
```

---

## 6. Формы — `input`, `select`, `textarea`

```css
input, select, textarea {
  background: rgba(14, 6, 26, 0.80);
  border: 1px solid var(--grg-glass-border);
  color: var(--grg-ink-100);
  border-radius: var(--grg-r-sm);
}
input:focus, select:focus, textarea:focus {
  border-color: var(--grg-purple-500);
  box-shadow: 0 0 0 2px rgba(138, 43, 226, 0.18);
}
```

---

## 7. Таблицы

```css
th {
  color: var(--grg-ink-300);
  font-family: var(--grg-font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  border-bottom: 1px solid var(--grg-glass-border);
}
td {
  border-bottom: 1px solid var(--grg-glass-border);
}
tr:hover td {
  background: rgba(138, 43, 226, 0.06);
}
```

---

## 8. Badges

```css
.badge {
  background: rgba(138, 43, 226, 0.15);
  border: 1px solid var(--grg-glass-border);
  color: var(--grg-purple-300);
  border-radius: var(--grg-r-sm);
}
```

---

## 9. Сообщения `.msg`

```css
.msg.err {
  background: rgba(255, 107, 107, 0.12);
  color: var(--grg-danger);
  border: 1px solid rgba(255, 107, 107, 0.25);
}
.msg.ok {
  background: rgba(61, 213, 152, 0.12);
  color: var(--grg-success);
  border: 1px solid rgba(61, 213, 152, 0.25);
}
```

---

## Порядок реализации

1. Создать `backend/public/styles/tokens.css` (копировать `docs/tokens.css`)
2. Добавить `<link>` в `admin.html`, удалить локальные CSS-переменные
3. `<body class="grg-bg">` — ambient-фон
4. Обновить `.card` — glassmorphism + `::before` highlight
5. Обновить `.sidebar` — glassmorphism, логотип, nav-dot
6. Обновить `button`, `button.secondary`, `button.danger`
7. Обновить `input`, `select`, `textarea`
8. Обновить `table`, `th`, `td`, `tr:hover`
9. Обновить `.badge`, `.msg`
10. Проверить в браузере: login overlay, sidebar, карточки, формы
