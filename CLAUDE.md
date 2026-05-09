# CLAUDE.md

Legacy compatibility note.

Этот проект сейчас ведется в Cursor. Если какой-либо агент или инструмент все еще читает `CLAUDE.md`, считай этот файл краткой прокладкой, а источником истины по проектным правилам и актуальному контексту - `AGENTS.md`.

## Что актуально

- Проект: `QA Companion`, Chrome extension на Manifest V3 для exploratory testing.
- Основной runtime: plain JavaScript + HTML/CSS.
- Главные файлы:
  - `background.js`
  - `js/popup.js`
  - `js/content_script.js`
  - `HTMLReport/`
- Хранилище: `chrome.storage.local`
- Тесты:
  - unit: `npm test`
  - e2e: `test/e2e/**/*.spec.js`

## Что больше неактуально

- Не считай этот репозиторий проектом "для Claude Code" - это устаревшая формулировка.
- Не считай `genetareZip.ps1` актуальным publish-скриптом - такого файла в репозитории сейчас нет.

## Практические заметки

- Перед изменениями читай `AGENTS.md`.
- При изменениях Chrome API обновляй моки в `jest.setup.js`.
- Для CSS/UI-правок полезен `.claude/skills/frontend-design/SKILL.md`.
- Для E2E-работ полезен `.claude/skills/playwright-cli/SKILL.md`.
