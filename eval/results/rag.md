# RAG szintű értékelés

46 teszteset (30 pontos és 10 tág angol kérdés, 6 magyar), 85 recept. Chunkok száma: recipe: 85, fixed: 239, section: 442.
Metrikák receptszinten: P@4 és R@4 (az éles rendszer 4 receptet ad a modellnek), MRR (az első releváns recept helye, 10-ig), Hit@1.
A pontos kérdéseknek 1-2 releváns receptje van, ezért ott a P@4 felső korlátja kb. 0,3; a tág kérdéseknél 2-5 recept is jó, ott a P@4 is beszédes.

## Összes angol kérdés (ilyen kérdéssel keres a chat modell)

| Beállítás | P@4 | R@4 | MRR | Hit@1 | Idő / kérdés (ms) |
|---|---|---|---|---|---|
| Receptenként, 3-small, rerank nélkül | 0.356 | 0.953 | 0.963 | 0.925 | 0 |
| Fix 800 karakter, 3-small, rerank nélkül | 0.35 | 0.948 | 0.931 | 0.875 | 1 |
| Szekciónként, 3-small, rerank nélkül | 0.363 | 0.963 | 0.975 | 0.95 | 1 |
| Receptenként, 3-large, rerank nélkül | 0.363 | 0.955 | 1 | 1 | 0 |
| Receptenként, 3-small, rerank fp32 / 512 token | 0.344 | 0.916 | 0.927 | 0.9 | 1240 |
| Receptenként, 3-small, rerank q8 / 256 token (éles) | 0.356 | 0.932 | 0.861 | 0.775 | 276 |
| Élő rendszer: pgvector + rerank (a chat kódja) | 0.363 | 0.96 | 0.881 | 0.8 | 464 |

## Pontos angol kérdések (egy konkrét étel vagy technika)

| Beállítás | P@4 | R@4 | MRR | Hit@1 | Idő / kérdés (ms) |
|---|---|---|---|---|---|
| Receptenként, 3-small, rerank nélkül | 0.275 | 0.983 | 0.983 | 0.967 | 0 |
| Fix 800 karakter, 3-small, rerank nélkül | 0.283 | 1 | 0.983 | 0.967 | 1 |
| Szekciónként, 3-small, rerank nélkül | 0.275 | 0.983 | 1 | 1 | 1 |
| Receptenként, 3-large, rerank nélkül | 0.275 | 0.983 | 1 | 1 | 0 |
| Receptenként, 3-small, rerank fp32 / 512 token | 0.275 | 0.967 | 0.954 | 0.933 | 1238 |
| Receptenként, 3-small, rerank q8 / 256 token (éles) | 0.275 | 0.967 | 0.898 | 0.833 | 282 |
| Élő rendszer: pgvector + rerank (a chat kódja) | 0.283 | 1 | 0.906 | 0.833 | 477 |

## Tág angol kérdések (több recept is jó válasz)

| Beállítás | P@4 | R@4 | MRR | Hit@1 | Idő / kérdés (ms) |
|---|---|---|---|---|---|
| Receptenként, 3-small, rerank nélkül | 0.6 | 0.863 | 0.9 | 0.8 | 0 |
| Fix 800 karakter, 3-small, rerank nélkül | 0.55 | 0.793 | 0.775 | 0.6 | 1 |
| Szekciónként, 3-small, rerank nélkül | 0.625 | 0.902 | 0.9 | 0.8 | 1 |
| Receptenként, 3-large, rerank nélkül | 0.625 | 0.872 | 1 | 1 | 0 |
| Receptenként, 3-small, rerank fp32 / 512 token | 0.55 | 0.763 | 0.845 | 0.8 | 1244 |
| Receptenként, 3-small, rerank q8 / 256 token (éles) | 0.6 | 0.83 | 0.75 | 0.6 | 259 |
| Élő rendszer: pgvector + rerank (a chat kódja) | 0.6 | 0.838 | 0.808 | 0.7 | 428 |

## Magyar kérdések fordítás nélkül

| Beállítás | P@4 | R@4 | MRR | Hit@1 | Idő / kérdés (ms) |
|---|---|---|---|---|---|
| Receptenként, 3-small, rerank nélkül | 0.208 | 0.5 | 0.306 | 0.167 | 0 |
| Fix 800 karakter, 3-small, rerank nélkül | 0.208 | 0.5 | 0.375 | 0.333 | 1 |
| Szekciónként, 3-small, rerank nélkül | 0.167 | 0.333 | 0.361 | 0.333 | 1 |
| Receptenként, 3-large, rerank nélkül | 0.333 | 1 | 0.722 | 0.5 | 1 |
| Receptenként, 3-small, rerank fp32 / 512 token | 0.083 | 0.111 | 0.209 | 0.167 | 1245 |
| Receptenként, 3-small, rerank q8 / 256 token (éles) | 0.125 | 0.167 | 0.185 | 0.167 | 277 |
| Élő rendszer: pgvector + rerank (a chat kódja) | 0.125 | 0.167 | 0.167 | 0.167 | 313 |

## Ahol az éles beállításnál a releváns recept nem az első helyen van

| Eset | Nyelv | Kérdés | Releváns | Első 4 találat |
|---|---|---|---|---|
| r07 | en | breaded and pan-fried chicken cutlets | chicken-schnitzel | chicken-nuggets, chicken-schnitzel, roti, no-knead-pan-pizza |
| r12 | en | crispy fried okra with Indian spices | bhindi-fry | vada, bhindi-fry, egg-biryani, thai-fried-rice |
| r21 | en | pocket bread baked in a hot oven | pita-bread | garlic-bread, pita-bread, mac-and-cheese, hasselback-butternut-squash |
| r26 | en | North African chili paste hot sauce | harissa-hot-sauce | yemeni-hot-sauce, jalepeño-hot-sauce, harissa-hot-sauce, sichuan-three-pepper-tofu |
| r30 | en | potato and pea curry | aloo-matar | massaman-curry, potato-and-green-chili-hash, phat-phrik-khing, samosa-pie |
| m01 | en | spicy Thai rice noodle stir-fry | pad-thai, pad-see-ew | thai-fried-rice, phat-phrik-khing, stir-fried-morning-glory, pad-thai |
| m07 | en | vegetarian main dish with tofu | sesame-tofu, sichuan-three-pepper-tofu, phat-phrik-khing | vegetarian-pho, phat-phrik-khing, sesame-tofu, sichuan-three-pepper-tofu |
| m08 | en | flatbread to make at home | roti, pita-bread, flour-tortillas | soft-pretzels-2, roti, flour-tortillas, pita-bread |
| m10 | en | Middle Eastern dip or spread | hummus, baba-ganoush | queso-dip, salami-chips-with-white-bean-dip, egg-biryani, baba-ganoush |
| h01 | hu | csicseriborsós curry | channa-masala | massaman-curry, phat-phrik-khing, biryani-shorba, lubia-polo |
| h02 | hu | írós palacsinta reggelire | diner-style-pancakes | smoky-jalepeno-and-lime-cranberry-sauce, baba-ganoush, guasacaca, flour-tortillas |
| h03 | hu | rántott csirkemell | chicken-schnitzel | smoky-jalepeno-and-lime-cranberry-sauce, smoky-three-chile-salsa, austro-hungarian-cream-of-horseradish-soup, hasselback-butternut-squash |
| h04 | hu | tormaleves | austro-hungarian-cream-of-horseradish-soup | flour-tortillas, carnitas-with-salsa-verde, oaxacan-black-beans, creamy-chicken-enchiladas |
| h06 | hu | padlizsánkrém | baba-ganoush | pad-thai, pad-see-ew, smoky-jalepeno-and-lime-cranberry-sauce, austro-hungarian-cream-of-horseradish-soup |
