# Как собрать APK и установить на Android

## Вариант А. Локально, через Android Studio (без облака и аккаунтов)

### Что нужно (один раз)
1. **Node.js 20+**.
2. **Android Studio** → More Actions → **SDK Manager** → вкладка *SDK Platforms*: поставьте **Android 16 (API 36)**;
   вкладка *SDK Tools* → галочка «Show Package Details» и поставьте:
   **Android SDK Build-Tools 36.0.0**, **NDK (Side by side) 27.1.12297006**, *Platform-Tools*. Примите лицензии.
3. **JDK 17** — отдельно ставить не нужно, подойдёт встроенный в Android Studio (папка `jbr`):
   * Windows (PowerShell): `$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"; $env:Path="$env:JAVA_HOME\bin;$env:Path"`
     (действует в текущем окне; насовсем — `setx JAVA_HOME "..."` и перезапуск PowerShell)
   * macOS: `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`
   * Linux: `export JAVA_HOME=~/android-studio/jbr`
4. Путь к SDK (его показывает SDK Manager сверху, «Android SDK Location»):
   * Windows: `$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"`
   * macOS: `export ANDROID_HOME=~/Library/Android/sdk`
   * Linux: `export ANDROID_HOME=~/Android/Sdk`

### Сборка APK
```bash
cd mobile
npm ci
npx expo prebuild --platform android      # создаст папку android/ (в git она не попадает)
cd android
./gradlew assembleRelease                  # macOS/Linux
.\gradlew.bat assembleRelease              # Windows PowerShell (с «.\» в начале!); в cmd — gradlew.bat assembleRelease
```
Готовый файл: **`mobile/android/app/build/outputs/apk/release/app-release.apk`**.
Первая сборка 10–25 минут (Gradle скачивает зависимости), следующие — 2–5 минут.

### Установка
* **По USB** (на телефоне: Настройки → О телефоне → 7 раз тапнуть «Номер сборки» → Для разработчиков → «Отладка по USB»):
  `adb install -r app/build/outputs/apk/release/app-release.apk`
* **Одной командой «собрать и поставить»** (телефон подключён по USB):
  `npx expo run:android --variant release` — сборка и установка сразу, без поиска файла.
* **Файлом**: отправьте `app-release.apk` на телефон (Telegram/почта/диск), откройте, разрешите
  «установку из неизвестных источников», при предупреждении Play Protect — «Всё равно установить».

### Подводные камни
* **`SDK location not found`** → создайте `android/local.properties` со строкой `sdk.dir=/путь/к/Android/Sdk`
  (Windows: `sdk.dir=C\:\\Users\\ИМЯ\\AppData\\Local\\Android\\Sdk`).
* **Windows: ошибки «path too long»** → держите проект в коротком пути (`C:\fresh`) и включите длинные пути Windows.
* **`Unsupported Java` / `JAVA_HOME`** → нужен именно JDK 17 (встроенный `jbr` из Android Studio подходит).
* **Нехватка памяти** → в `android/gradle.properties` поставьте `org.gradle.jvmargs=-Xmx4096m`.
* Если поменяли `app.json` (название, иконка, пакет) — заново `npx expo prebuild --platform android --clean`.
* Релизный APK подписывается стандартным отладочным ключом шаблона — для раздачи «из рук в руки» этого достаточно,
  обновления ставятся поверх. Для Google Play нужен собственный ключ (или облачная сборка Б).
* Apple/iOS локально собрать можно только на Mac с Xcode.

---

Нужно один раз: аккаунт на https://expo.dev (бесплатный) и Node.js 20+.

## Вариант Б. В облаке (EAS)

### 1. Сборка
```bash
cd mobile
npm ci
npm i -g eas-cli
eas login                 # логин/пароль от expo.dev
eas init                  # создаст проект; ответьте Y
eas build -p android --profile preview
```
* На вопрос про **keystore** отвечайте «Generate new keystore» — EAS создаст и сохранит ключ сам.
  Этот ключ нужен для всех будущих обновлений: не удаляйте проект на expo.dev.
* Сборка идёт в облаке 10–25 минут (в бесплатной очереди может быть дольше). Терминал можно закрыть —
  прогресс виден на https://expo.dev → Projects → FreshFlow → Builds.
* В конце появится ссылка и QR-код на `.apk`.
* После `eas init` в `app.json` добавятся `owner` и `extra.eas.projectId` — закоммитьте их.

### 2. Установка на телефон
1. Откройте ссылку (или отсканируйте QR) **на самом телефоне** и скачайте `.apk`.
2. Нажмите на скачанный файл. Android спросит разрешение «Установка из неизвестных источников» для браузера —
   разрешите (Настройки → для этого браузера → «Разрешить»).
3. Если Google Play Protect предупреждает о неизвестном разработчике — «Всё равно установить».
4. Откройте FreshFlow, на дашборде нажмите «Включить уведомления» и разрешите.

Через USB: `adb install FreshFlow.apk` (включите «Отладку по USB»).

### 3. Обновление
Повторите `eas build -p android --profile preview` и установите новый `.apk` поверх старого —
данные сохранятся (ключ подписи тот же). Номер версии можно поднять в `app.json` → `expo.version`.

### 4. Для Google Play
`eas build -p android --profile production` соберёт `.aab`; для магазина нужен аккаунт разработчика Google (разовый взнос).

## Если что-то не так (облако)
* **Сборка упала**: откройте лог на expo.dev → Builds → ваша сборка → «Run gradlew».
* **В приложении «Нет связи с сервером»**: аватар → Настройки → Сервер, проверьте адрес API.
  Первый запрос к Railway после простоя может идти до 10–20 секунд — это «просыпается» сервис.
* **Нет уведомлений**: Настройки телефона → Приложения → FreshFlow → Уведомления; отключите экономию батареи для приложения.
