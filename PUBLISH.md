# Publish QA Companion

Короткая инструкция по сборке и публикации расширения в Chrome Web Store.

## Что уже есть в репо

Для сборки publish-архива есть команда:

```bash
npm run build:webstore
```

Она собирает чистый `.zip` в `dist/qa-companion-webstore-v<version>.zip` и включает только runtime-файлы расширения:

- `manifest.json`
- `background.js`
- `popup.html`
- `import-session.html`
- `src/`
- `js/`
- `css/`
- `icons/`
- `images/`
- `lib/`
- `HTMLReport/`
- `_locales/`

Тесты, docs, `.claude/`, `.github/`, `node_modules/`, `playwright-report/` и прочая служебка в архив не попадают.

Промежуточная staging-папка создается только на время сборки и затем автоматически удаляется, так что в `dist/` должен оставаться только итоговый архив.

## Перед публикацией

Сделай минимум этот чеклист:

1. Подними версию в `manifest.json`.
2. Прогони базовую проверку:
   - `npm test`
   - при необходимости e2e-спеки, которые важны для текущего релиза
3. Проверь руками ключевые сценарии:
   - создание бага/заметки
   - обычный screenshot и crop
   - Recorder: record / replay
   - export/import JSON
   - HTML report
   - локализация `ru/en`
4. Убедись, что в UI нет debug-артефактов и временных тестовых данных.
5. Подготовь store-материалы:
   - иконка
   - скриншоты
   - короткое описание
   - полное описание
   - support/contact email

## Сборка архива

```bash
npm install
npm run build:webstore
```

После этого проверь, что появился файл:

```bash
dist/qa-companion-webstore-v<version>.zip
```

Если сборка падает:

- на Linux/macOS нужен установленный `zip`
- на Windows используется PowerShell `Compress-Archive`

## Как загрузить в Chrome Web Store

1. Открой [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Создай новый item.
3. Загрузи архив из `dist/`.
4. Заполни store listing:
   - name
   - short description
   - detailed description
   - screenshots
   - category
   - language
5. Заполни privacy/compliance блок.
6. Отправь расширение на review.

## Что написать про permissions

В этом проекте есть такие permission'ы:

- `storage`
  - хранение сессии, draft, recorder state, screenshots
- `tabs`
  - получение URL/состояния активной вкладки для записи, replay и environment info
- `activeTab`
  - доступ к текущей вкладке пользователя по его действию
- `downloads`
  - скачивание JSON/HTML report
- `scripting`
  - инъекция `content_script.js` и crop/editor flow
- `notifications`
  - сообщения о сохранении и storage limit
- `unlimitedStorage`
  - хранение screenshot-данных и больших тестовых сессий

Формулируй это просто и по делу. Review хуже проходит, когда permission'ы описаны расплывчато.

## Что особенно важно для review

Проверь перед отправкой:

1. В архиве нет файлов разработки и тестов.
2. Все permissions реально используются и объяснимы.
3. Нет remote code и загрузки исполняемого JS с внешних серверов.
4. Нет вводящего в заблуждение описания в store listing.
5. Если будешь заявлять, что данные никуда не отправляются, это должно быть правдой для текущей сборки.

## Рекомендуемый релизный сценарий

```bash
npm test
npm run build:webstore
```

Потом:

1. вручную проверить расширение как unpacked
2. загрузить `dist/*.zip` в Web Store
3. пройти listing + compliance
4. отправить на review
