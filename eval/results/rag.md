# RAG szintű értékelés

125 teszteset (30 pontos és 10 tág kézzel írt kérdés, 85 LLM által generált kérdés receptenként), 85 recept. Chunkok száma: recipe: 85, fixed: 239, section: 442.
Metrikák receptszinten: P@4 és R@4 (az éles rendszer 4 receptet ad a modellnek), MRR (az első releváns recept helye, 10-ig), Hit@1.
Az idő oszlop: a memóriabeli LLM rerank változatoknál a reranker válaszai cache-ből jönnek; a valós keresési idő (embedding + pgvector + LLM rerank) az élő rendszer sorában látszik.
A pontos kérdéseknek 1-2 releváns receptje van, ezért ott a P@4 felső korlátja kb. 0,3; a tág kérdéseknél 2-5 recept is jó, ott a P@4 is beszédes.

## Összes kérdés

| Beállítás | P@4 | R@4 | MRR | Hit@1 | Idő / kérdés (ms) |
|---|---|---|---|---|---|
| Receptenként, 3-small, rerank nélkül | 0.288 | 0.985 | 0.988 | 0.976 | 0 |
| Fix 800 karakter, 3-small, rerank nélkül | 0.286 | 0.983 | 0.978 | 0.96 | 1 |
| Szekciónként, 3-small, rerank nélkül | 0.29 | 0.988 | 0.992 | 0.984 | 1 |
| Receptenként, 3-large, rerank nélkül | 0.29 | 0.986 | 1 | 1 | 1 |
| Receptenként, 3-small, LLM rerank (gpt-4.1-mini) | 0.292 | 0.993 | 0.992 | 0.984 | 2049 |
| Receptenként, 3-large, LLM rerank (gpt-4.1-mini) – éles | 0.296 | 0.996 | 0.992 | 0.984 | 2024 |
| Élő rendszer: pgvector + LLM rerank (a chat kódja) | 0.294 | 0.994 | 0.992 | 0.984 | 2928 |

## Pontos kérdések (egy konkrét étel vagy technika)

| Beállítás | P@4 | R@4 | MRR | Hit@1 | Idő / kérdés (ms) |
|---|---|---|---|---|---|
| Receptenként, 3-small, rerank nélkül | 0.275 | 0.983 | 0.983 | 0.967 | 0 |
| Fix 800 karakter, 3-small, rerank nélkül | 0.283 | 1 | 0.983 | 0.967 | 1 |
| Szekciónként, 3-small, rerank nélkül | 0.275 | 0.983 | 1 | 1 | 1 |
| Receptenként, 3-large, rerank nélkül | 0.275 | 0.983 | 1 | 1 | 1 |
| Receptenként, 3-small, LLM rerank (gpt-4.1-mini) | 0.283 | 1 | 1 | 1 | 0 |
| Receptenként, 3-large, LLM rerank (gpt-4.1-mini) – éles | 0.283 | 1 | 1 | 1 | 1 |
| Élő rendszer: pgvector + LLM rerank (a chat kódja) | 0.283 | 1 | 1 | 1 | 2870 |

## Tág kérdések (több recept is jó válasz)

| Beállítás | P@4 | R@4 | MRR | Hit@1 | Idő / kérdés (ms) |
|---|---|---|---|---|---|
| Receptenként, 3-small, rerank nélkül | 0.6 | 0.863 | 0.9 | 0.8 | 0 |
| Fix 800 karakter, 3-small, rerank nélkül | 0.55 | 0.793 | 0.775 | 0.6 | 1 |
| Szekciónként, 3-small, rerank nélkül | 0.625 | 0.902 | 0.9 | 0.8 | 1 |
| Receptenként, 3-large, rerank nélkül | 0.625 | 0.872 | 1 | 1 | 1 |
| Receptenként, 3-small, LLM rerank (gpt-4.1-mini) | 0.625 | 0.91 | 1 | 1 | 261 |
| Receptenként, 3-large, LLM rerank (gpt-4.1-mini) – éles | 0.675 | 0.955 | 1 | 1 | 1 |
| Élő rendszer: pgvector + LLM rerank (a chat kódja) | 0.65 | 0.93 | 1 | 1 | 2883 |

## Generált kérdések (receptenként egy, a kurzus rag_level_evaluation módszerével)

| Beállítás | P@4 | R@4 | MRR | Hit@1 | Idő / kérdés (ms) |
|---|---|---|---|---|---|
| Receptenként, 3-small, rerank nélkül | 0.256 | 1 | 1 | 1 | 0 |
| Fix 800 karakter, 3-small, rerank nélkül | 0.256 | 1 | 1 | 1 | 1 |
| Szekciónként, 3-small, rerank nélkül | 0.256 | 1 | 1 | 1 | 1 |
| Receptenként, 3-large, rerank nélkül | 0.256 | 1 | 1 | 1 | 1 |
| Receptenként, 3-small, LLM rerank (gpt-4.1-mini) | 0.256 | 1 | 0.988 | 0.976 | 2983 |
| Receptenként, 3-large, LLM rerank (gpt-4.1-mini) – éles | 0.256 | 1 | 0.988 | 0.976 | 2976 |
| Élő rendszer: pgvector + LLM rerank (a chat kódja) | 0.256 | 1 | 0.988 | 0.976 | 2955 |

## Ahol az éles beállításnál a releváns recept nem az első helyen van

| Eset | Kérdés | Releváns | Első 4 találat |
|---|---|---|---|
| g-egg-biryani | How do I make the gravy for egg biryani and what spices are used? | egg-biryani | biryani-shorba, egg-biryani, black-pepper-rice, spanish-rice |
| g-pizza-dough | How do I make pizza dough that needs to rest overnight in the fridge? | pizza-dough | no-knead-pan-pizza, pizza-dough, thin-crust-pizza, pita-bread |
