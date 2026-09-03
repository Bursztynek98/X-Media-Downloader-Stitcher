# 🧩 X (Twitter) Media Downloader & Stitcher - Rozszerzenie do Przeglądarki

Zaawansowane rozszerzenie do przeglądarek internetowych (Chrome, Edge, Brave, Opera, Firefox - **Manifest V3**), które dodaje przycisk pobierania pod każdym wpisem (tweetem) na portalu **X (Twitter)**.

Umożliwia pobieranie zdjęć w najwyższej jakości (`name=orig`), filmów, GIF-ów oraz **automatyczne scalanie podzielonych obrazków (panoram) w jeden perfekcyjny plik PNG bez sztucznych kresek**.

---

## 🌟 Najważniejsze Funkcje

### 🖼️ Obrazki & Bezszwowe Panoramy
- 📥 **Oryginalna Jakość (`name=orig`)**: Rozszerzenie automatycznie zamienia miniaturki (`name=small`, `name=900x900`) na pełną, oryginalną rozdzielczość.
- 🧩 **Bezszwowe Scalanie Obrazków (Smart Auto-Crop)**:
  - **Opcja "Scal w 1 obraz (Poziomo - Panorama)"** – idealna do podzielonych grafik publikowanych obok siebie.
  - **Wykrywanie i usuwanie kresek (1px Seam Auto-Crop)** – algorytm automatycznie analizuje krawędzie grafik, wykrywa 1-2px czarne, białe, szare lub przezroczyste obramówki i obcina je przed scaleniem, dając **idealny, bezszwowy obrazek**.
  - **Opcja "Scal w 1 obraz (Pionowo)"**.
- 📦 **Pobieranie Masowe**: Pobierz wszystkie zdjęcia z wpisu osobno za jednym kliknięciem.

### 🎬 Wideo & Konwersja na Animowany GIF
- 🎥 **Wideo w Najwyższej Jakości (MP4)**: Automatyczna analiza zasobów odtwarzacza X i wybór najwyższej dostępnej rozdzielczości wideo (np. 1080p / 720p).
- 🎞️ **Automatyczna Konwersja MP4 ➡️ GIF**:
  - X zapisuje publikowane GIF-y jako pliki wideo MP4. Rozszerzenie umożliwia wybranie opcji **`Pobierz jako .GIF (Animowany GIF)`**, która bezpośrednio w przeglądarce konwertuje wideo na prawdziwy plik `.gif`.
  - Wskaźnik postępu konwersji w czasie rzeczywistym (np. `Konwertowanie na GIF... (50%)`).
  - Opcja pobrania oryginalnego pliku `.mp4`.
- 🔀 **Obsługa Wielu Wideo / GIF w Jednym Poście**: Każdy element wideo w wpisie jest traktowany niezależnie – pobierzesz dokładnie ten film/GIF, który wybierzesz z menu.

### 🔍 Wygoda & Interfejs UI
- 👁️ **Podgląd po Najechaniu Myszką (Hover Preview)**: Najechanie na dowolną opcję w menu wyświetla miniaturowy podgląd obrazka lub układu scalenia.
- ⚡ **Bezpośrednie Pobieranie (Bez Nowych Kart)**: Przetwarzanie plików przez lokalny `Blob` gwarantuje, że przeglądarka od razu zapisuje plik w folderze *Pobrane*, nie otwierając przy tym nowych kart.
- 🎨 **Natywny Wygląd X**: Przycisk i menu idealnie pasują do jasnego i ciemnego motywu serwisu X.

---

## 🛠️ Jak Zainstalować w Przeglądarce (Chrome / Edge / Brave / Opera)

1. Otwórz przeglądarkę i przejdź do panelu rozszerzeń:
   - **Microsoft Edge**: `edge://extensions/`
   - **Google Chrome**: `chrome://extensions/`
   - **Brave**: `brave://extensions/`
2. Włącz **"Tryb programisty"** (*Developer mode*) w górnym menu/panelu bocznym.
3. Kliknij przycisk **"Załaduj rozpakowane"** (*Load unpacked*).
4. Wskaz folder projektu: `f:\CODE\addon_x_dwonload`.
5. Wejdź na stronę **[x.com](https://x.com)** – pod każdym wpisem pojawi się nowa ikona pobierania!

---

## 🚀 Jak Używać

1. Przeglądaj portal X.
2. Na dole każdego wpisu znajdziesz **strzałkę pobierania** obok ikony udostępniania/zakładek.
3. Kliknięcie ikony otworzy menu akcji:
   - 🧩 **Scal w 1 obraz (Poziomo - Panorama)** – łączy potrójne lub podwójne grafiki w jeden plik PNG.
   - 🖼️ **Obrazek 1 / 2 / 3 (Oryginał)** – pobiera pojedynczą grafikę w najwyższej jakości.
   - 🎞️ **Pobierz jako .GIF (Animowany GIF)** – konwertuje plik na prawdziwy animowany `.gif`.
   - 🎥 **Pobierz Wideo (.MP4)** – pobiera plik filmowy.

---

## 📁 Struktura Projektu

- `manifest.json` – Konfiguracja Manifest V3 (uprawnienia, dopasowanie domeny `x.com`, `twimg.com`)
- `content.js` – Skrypt wykonawczy (analiza DOM, przyciski, podgląd hover, autokorekta kresek 1px, scalanie canvas)
- `gif_encoder.js` – Własny konwerter wideo MP4 do animowanego formatu GIF (LZW)
- `styles.css` – Style CSS przycisku, menu rozwijanego, podglądu i powiadomień toast
- `icons/` – Ikony rozszerzenia w rozdzielczościach 16x16, 48x48, 128x128
- `generate_icons.js` – Skrypt generujący ikony PNG w Bun
