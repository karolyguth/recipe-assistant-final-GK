# Evaluation eredmények

Háromszintű értékelés a receptasszisztensen: RAG (visszakeresés), prompt (egy kérdés – egy válasz) és alkalmazás (teljes felhasználói utak). A részletes, generált riportok:

- [results/rag.md](results/rag.md) – RAG szint
- [results/prompt.md](results/prompt.md) – prompt szint
- [results/app.md](results/app.md) – alkalmazás szint, a beszélgetések: [results/app-conversations/](results/app-conversations/)

| Szint | Tesztesetek (minimum) | Fő eredmény |
|---|---|---|
| RAG | **125** (20) | MRR 0,99, R@4 0,99 (éles beállítás) |
| Prompt | **18** (15) | 94% helyes a ground truth szerint, 0 hallucináció, 100% elvárt viselkedés |
| Alkalmazás | **12** komplex út (10) | 12/12 cél teljesült, elégedettség 4,42/5, válaszidő medián 30 s |

Az értékelő (judge) mindenhol `gpt-4.1`, temperature 0, a tesztelt asszisztens pedig `gpt-5`, így a modell nem saját magát pontozza. Az LLM hívások cache-elve vannak (`eval/.cache`), az újrafuttatás nem fizet újra.

## 1. RAG szintű értékelés

**Módszer** (`eval/rag-eval.ts`):
- **Tesztkészlet:**
  - 30 kézzel írt pontos kérdés (egy konkrét étel vagy technika)
  - 10 tág kérdés, ahol több recept is jó (pl. „homemade hot sauce”: 5 recept)
  - 85 LLM által generált kérdés, receptenként egy, a kurzus `rag_level_evaluation.py` módszerével (`eval/generate-rag-queries.ts`)
- **Metrikák receptszinten:** precision@4 és recall@4 (az éles rendszer 4 receptet ad a modellnek), MRR, hit@1.
- **Összehasonlított beállítások:** chunkolás (receptenként / fix 800 karakter / szekciónként), embedding modell (`text-embedding-3-small` / `-large`), reranking (nincs / LLM), és az élő rendszer (pgvector + rerank, a chat saját kódjával).

**Eredmény (mind a 125 kérdés):**

| Beállítás | P@4 | R@4 | MRR | Hit@1 |
|---|---|---|---|---|
| Receptenként, 3-small, rerank nélkül (a kiinduló rendszer) | 0,288 | 0,985 | 0,988 | 0,976 |
| Fix 800 karakter, 3-small | 0,286 | 0,983 | 0,978 | 0,960 |
| Szekciónként, 3-small | 0,290 | 0,988 | 0,992 | 0,984 |
| Receptenként, 3-large, rerank nélkül | 0,290 | 0,986 | 1,000 | 1,000 |
| **Receptenként, 3-large, LLM rerank (éles)** | **0,296** | **0,996** | 0,992 | 0,984 |

A különbség a **tág kérdéseknél** látszik (itt a P@4 is beszédes, mert több jó recept van):

| Beállítás | P@4 | R@4 | MRR |
|---|---|---|---|
| Receptenként, 3-small, rerank nélkül | 0,60 | 0,86 | 0,90 |
| Fix 800 karakter, 3-small | 0,55 | 0,79 | 0,78 |
| Receptenként, 3-large, LLM rerank (éles) | **0,68** | **0,96** | **1,00** |

**Következtetések:**
- **Chunkolás:** a receptenkénti chunk (összefoglaló sorral) a legjobb vagy holtversenyben a legjobb. A fix méretű darabolás a tág kérdéseknél gyengébb, mert a recept címe és hozzávalói külön darabokba kerülnek.
- **Embedding modell:** a `3-large` jobb, mint a `3-small` (MRR 0,988 → 1,0).
- **Reranking – az értékelés alapján változtattam:** az első reranker egy helyi cross-encoder volt (`ms-marco-MiniLM-L-6-v2`). A mérés szerint **rontott** (MRR 0,963 → 0,861, a tág kérdéseknél 0,90 → 0,75), és a gépet is terhelte. Lecseréltem egy LLM rerankerre (`gpt-4.1-mini` pontozza a 20 jelöltet); ez a tág kérdéseknél javít a legtöbbet (R@4 0,86 → 0,96).
- **Ára:** keresésenként kb. 3 s és ~0,002 $ a reranker hívás (kb. 3 500 input token gpt-4.1-mini-vel).
- **A generált kérdések könnyűek:** majdnem mindig megnevezik az ételt, ezért ott minden beállítás ~1,0. A beállítások közti különbséget a kézzel írt tág kérdések mutatják meg.
- **Az élő rendszer** ugyanazt az eredményt adja, mint a memóriabeli mérés, tehát a pgvector-os keresés helyesen működik.

## 2. Prompt szintű értékelés (single-turn)

**Módszer** (`eval/prompt-eval.ts`):
- **18 kérdés 6 kategóriában:**
  - receptre kérdez (5)
  - hozzávalóból indul (3)
  - technika vagy helyettesítés (3)
  - hiányzó étel (3)
  - témán kívüli kérdés (2)
  - hamis feltevés, pl. „a pad thai-ban csirke van, ugye?” (2)
- **Az élő asszisztens válaszol**, a chat végpont JSON módjában, a visszakeresett receptekkel együtt.
- **Esetenként két judge hívás:**
  - **Helyesség** a ground truth válaszhoz képest (CORRECT / INCORRECT), a kurzus `single_turn_evaluation.py` promptjával.
  - **A többi szempont** (0–3, indoklással):
    - kontextus relevancia (jók-e a visszakeresett receptek)
    - hűség a kontextushoz (faithfulness)
    - válasz relevancia
    - az elvárt viselkedés teljesülése
  - **Hallucináció detektálás:** a judge felsorolja azokat az állításokat, amelyeket a visszakeresett receptek nem támasztanak alá, és nincsenek általános tanácsként jelölve. Ha van ilyen, az hallucináció.

**Eredmény:**

| Kategória | Esetek | Helyes | Kontextus | Hűség | Relevancia | Elvárt viselkedés | Hallucináció |
|---|---|---|---|---|---|---|---|
| recept | 5 | 100% | 3 | 3 | 3 | 100% | 0% |
| hozzávaló | 3 | 67% | 3 | 3 | 3 | 100% | 0% |
| technika | 3 | 100% | 3 | 3 | 3 | 100% | 0% |
| hiányzó étel | 3 | 100% | 2 | 3 | 3 | 100% | 0% |
| témán kívül | 2 | 100% | 0* | 3 | 3 | 100% | 0% |
| hamis feltevés | 2 | 100% | 3 | 3 | 3 | 100% | 0% |
| **Összesen** | **18** | **94%** | 2,5 | 3 | 3 | **100%** | **0%** |

\* Témán kívüli kérdésnél helyesen nem keres semmit, ezért a kontextus relevancia 0; ez nem hiba.

**Megállapítások:**
- **A system prompt szabályai működnek:**
  - hiányzó ételnél nem talál ki receptet
  - a témán kívüli kérdést udvariasan elutasítja
  - a hamis feltevést kijavítja („a Pad Thai recept nem tartalmaz csirkét, tofu és szárított garnéla van benne”)
  - az általános tanácsot jelöli
- **Az egyetlen hibás eset (p07, „mit főzhetek tofuból?”):** a keresés a Massaman Curryt hozta (nincs benne tofu), és kimaradt a Sichuan Three-Pepper Tofu és a Pad Thai, így a válasz hiányos. A hozzávaló alapú, tág kérdés a keresés gyenge pontja.
- **A judge-ot is ellenőrizni kellett:** az első változat hallucinációnak jelölte a „from general cooking practice” jelölésű tanácsokat is (amit a system prompt megenged), miközben a hűségre 3/3-at adott. A szabály pontosítása után a két jelzés összhangban van.

## 3. Alkalmazás szintű értékelés (teljes felhasználói utak)

**Módszer** (`eval/app-eval.ts`, a 4. heti szimulátor továbbfejlesztve):
- **12 komplex forgatókönyv:**
  - izguló kezdő, siető szülő, csalódott szakértő (hiányzó carbonara)
  - heti menü 3 konyhából
  - mogyoróallergia
  - mentett preferencia (memória)
  - **saját recept feltöltése és kérdezés róla** (a teszt az API-n tölti fel és dolgozza fel, a végén törli)
  - hiányzó hozzávaló helyettesítése
  - hibaelhárítás (zsíros rántott hús)
  - mennyiségek felszorzása 8 főre
  - témától eltérő kérés
  - homályos kérés szűkítése
- **Szimulált user** (`gpt-4.1-mini`):
  - perszóna, cél és sikerkritériumok
  - a tulajdonságokat (türelem, szakértelem, bőbeszédűség, frusztrációtűrés) seedelt véletlengenerátor sorsolja
  - a nyitó üzenetet az LLM írja
  - minden válasz után dönt: elégedettség 1–5, folytatja-e, mi a következő üzenete
  - a türelem szerint legfeljebb 2–4 választ vár meg
- **Judge** (beszélgetésenként egy hívás): segítőkészség, megalapozottság (nincs kitalált recept), hangnem (0–3), és minden sikerkritériumra külön döntés.
- **Latencia:** a végpont saját mérése minden körben (első token, teljes idő).
- **Izoláció:** a beszélgetések egymás után futnak; a mentett jegyzetek és a feltöltött tesztrecept minden eset után törlődnek.

**Eredmény:**

| Metrika | Érték |
|---|---|
| Cél teljesült (minden kritérium) | 12 / 12 |
| Segítőkészség / megalapozottság / hangnem | 3 / 3 / 3 |
| Szimulált elégedettség | 4,42 / 5 |
| Első token, medián / p95 | 26,9 s / 43,1 s |
| Teljes válaszidő, medián / p95 | 30,3 s / 47,8 s |

**Emberi átnézés – a judge túl engedékeny:** a judge minden esetre maximális pontot adott, ezért három beszélgetést magam is elolvastam:
- **Izguló kezdő:** a user csirkemellet említett, és a keresés első találata a Chicken Schnitzel volt (csirkemellből készül). Az asszisztens mégis a Teriyaki Chickent ajánlotta (csirkecombból készül), és általános tanácsként írta le, hogyan lehet mellel elkészíteni. Működik, de nem a legjobb választás; a judge ezt nem kifogásolta.
- **Vendégség:** a user azt írta, hogy a recept 4 főre szól, pedig a receptben nincs adag megadva. Az asszisztens ezt nem jelezte, csak duplázott. A számolás maga helyes.
- **Rövid beszélgetések:** a szimulált userek többsége az első válasz után elégedett volt (12 beszélgetésben 18 válasz), így a több körös viselkedés kevéssé van tesztelve.

**Következtetés:** az LLM judge 3-as skálája ezen a szinten nem elég finom, a hibákat emberi átnézés találta meg. A judge kalibrálása (néhány beszélgetés kézi pontozása és összevetése) és a nehezebb, több kört kikényszerítő forgatókönyvek a következő lépés.

## 4. Teljesítmény és költség (a monitoring adataiból)

Az értékelések forgalma a monitoringban is megjelent (47 chat kérés egy nap alatt):

| Metrika | Érték |
|---|---|
| Első token, medián / p95 | 18,8 s / 39,8 s |
| Teljes válaszidő, medián / p95 | 21,8 s / 44,5 s |
| Keresés kérésenként (több keresés is lehet) | átlag 4,1 s, ebből reranking 3,3 s |
| Költség | átlag 0,023 $ / kérés (összesen 1,08 $) |
| Hibás vagy leállított kérés | 2 (mindkettő szándékos leállítás a tesztben) |

A válaszidő nagy részét a `gpt-5` gondolkodása adja, a keresés kb. 4 s-ot. A gyorsítás lehetőségei:
- kisebb chat modell (`CHAT_MODEL`)
- a reranker kikapcsolása a pontos kérdéseknél
- egy keresés kérdésenként

## Futtatás

Az app fusson (`pnpm dev`), és a `.env`-ben legyen `OPENAI_API_KEY`.

```bash
pnpm eval:rag              # RAG szint (memóriában + az élő pgvector)
pnpm eval:prompt           # prompt szint (élő asszisztens + judge); --rejudge: csak újraértékelés
pnpm eval:app              # alkalmazás szint (szimulált userek)
pnpm eval:generate-rag     # a generált RAG kérdések újragenerálása
```
