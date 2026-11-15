# SIG-UTP · Plataforma de Gestión Técnico-Pedagógica

Colores institucionales del Colegio Marina de Chile (azul marino `#204070` y dorado `#f0c030`, tomados de colegiomarinadechile.cl).

Calendario multi-escala (año · semana · día · bloque), cobertura docente, horarios y espacios para la UTP.
Costo de operación: **$0** (GitHub Pages + Google Sheets + Google Apps Script).

## Cómo está armado

| Pieza | Dónde vive | Qué contiene |
|---|---|---|
| App (HTML/CSS/JS, sin compilación) | GitHub Pages (repositorio público) | Solo código. **Ningún dato del colegio.** |
| Base de datos | Una Google Sheet en el Drive del colegio | Una hoja por tabla, legible y editable a mano |
| API | Apps Script vinculado a esa planilla (`apps-script/Code.gs`) | Valida la sesión Google y el rol en cada petición |
| Copia local | `localStorage` de cada navegador | Guardado inmediato y uso sin conexión |

**Seguridad.** El repositorio es público, por eso los datos nunca se suben a él (`.gitignore` bloquea los `.xlsx`).
Cada petición lleva un ID token de Google que el servidor verifica con Google (firma, audiencia, vigencia, correo verificado)
y contrasta con la hoja `usuarios`. Roles: `admin` (todo), `editor` (eventos, ausencias, reemplazos, foco semanal), `lector`.
Todo texto se escapa al mostrarse, las celdas se guardan como texto (sin fórmulas inyectables) y la página tiene una
Content-Security-Policy estricta. Al importar la base de horarios **el RUT no se importa**.

## Un solo archivo de datos

Toda la plataforma se carga y se respalda con **un único libro**: `SIG-UTP_Base_Unificada_AAAA.xlsx`.
Tiene una hoja `LEEME`, nueve hojas de datos (`01_Semanas_Clases` … `09_Cumpleanos`, con las mismas columnas
que la planilla de Google) y hojas `VISTA_MES` con el calendario en grilla, solo de lectura.

- **Cargar:** *Ajustes → Cargar base unificada* (reemplaza todo lo que haya).
- **Respaldar / actualizar:** *Ajustes → Descargar base unificada*.
- Se puede editar en Excel respetando encabezados, la columna `id`, fechas `AAAA-MM-DD` y horas `HH:MM`.
- Las planillas antiguas (BD_AppSheet, Calendario Anual, Calendario Semanal) siguen aceptándose en
  *Agregar desde archivos originales*, pero ya no son necesarias.
- Contiene datos personales (incluye nombres de estudiantes en algunos bloques PIE): **nunca** lo subas al repositorio.

## Probarla ahora mismo (modo local, sin nube)

```bash
python3 -m http.server 8765
```

Abre `http://localhost:8765`, ve a **Ajustes → Cargar base unificada** y elige el libro unificado.
En modo local los datos quedan solo en ese navegador.

## Puesta en marcha con varios usuarios (base en Google Drive)

La base vive en una **Hoja de cálculo de Google** con las mismas pestañas que la base unificada (`01_Semanas_Clases` …
`09_Cumpleanos`). La app la lee y escribe a través de un Apps Script vinculado a esa Hoja; también se puede editar a
mano o con otras herramientas: el backend detecta esos cambios (fecha de modificación del archivo) y las apps descargan
todo de nuevo. Siempre se puede descargar como .xlsx (*Archivo → Descargar*).

1. **Hoja.** Abre la Hoja de la base (o súbela: *Nuevo → Subir archivo* con la base unificada .xlsx y luego
   *Abrir con Hojas de cálculo de Google*). *Extensiones → Apps Script*, borra el contenido, pega `apps-script/Code.gs`,
   guarda, elige `instalar` y pulsa **Ejecutar** (acepta los permisos). Agrega a cada pestaña las columnas de control
   `_rev`, `_del`, `_por` (no las borres) y crea la pestaña `usuarios` contigo como `admin`.
2. **ID de cliente Google.** En <https://console.cloud.google.com> crea un proyecto → *APIs y servicios → Pantalla de
   consentimiento* tipo **Interno** (cuenta del colegio) → *Credenciales → Crear credenciales → ID de cliente de OAuth →
   Aplicación web*. En **Orígenes autorizados de JavaScript** agrega `https://for-mi-da-ble.github.io`.
3. **Conecta el script con ese ID.** En Apps Script: *Configuración del proyecto → Propiedades de la secuencia de comandos* →
   edita `GOOGLE_CLIENT_ID` y pega el ID.
4. **Publica la API.** *Implementar → Nueva implementación → Aplicación web* · Ejecutar como: **Yo** · Quién tiene acceso:
   **Cualquier usuario**. Copia la URL que termina en `/exec`. ("Cualquier usuario" solo permite *llamar* a la API: sin un
   token válido de una cuenta autorizada responde error y no entrega datos.) Si la administración de Google Workspace del
   colegio no permite esa opción, hay que pedir que la habilite.
5. **Configura la app.** Edita `config.js` con `API_URL` (la URL `/exec`) y `GOOGLE_CLIENT_ID`. No son secretos.
6. **Usuarios.** Agrega filas en la pestaña `usuarios`: `correo | rol` (`admin`, `editor` o `lector`).

Al conectarse por primera vez, cada navegador **descarta lo que tenía en modo local** y descarga la Hoja (la Hoja manda).
Si editaste en modo local algo que no está en la Hoja, descarga antes la base unificada desde *Ajustes*.
Al cambiar `Code.gs` más adelante: *Implementar → Administrar implementaciones → Editar → Versión nueva* (misma URL).
Edición a mano en la Hoja: no cambies la columna `id` ni borres `_rev`; una fila nueva necesita un `id` que no se repita.
En `detalle`, las subsecciones se escriben `## E. Media` (una celda que empieza con `=` es una fórmula para Sheets).

## Uso diario

- **Hoy:** botón *Registrar ausencia* → al elegir el docente se ven de inmediato los bloques que deja sin atender y quién
  puede cubrir (No lectivo / Aula de recursos PIE, ordenados por quien lleva menos reemplazos en el mes). Un toque asigna.
  *Generar parte de las 08:00* arma el texto y la tabla para Gmail o WhatsApp.
- **Semana:** dos barras a lo ancho de los cinco días, como el PDF. Orden de las burbujas de cada día:
  - *Actividades estudiantes:* 1) **notas especiales** (rojo pálido), 2) **¡Feliz cumpleaños!**
    (naranja), 3) **actividades** (azul), 4) **reforzamiento** (amarillo, una burbuja con todas sus líneas), 5) **talleres
    extraescolares** (celeste, una burbuja).
  - *Actividades funcionarios:* 0) **notas especiales** (rojo pálido), 1) **trabajo con funcionarios** (amarillo pálido), 2) **consejo de profesores** y
    **reuniones lineales** (una burbuja cada uno, con las del calendario y las fijas), 3) **reuniones de departamento** del día (una burbuja), 4) **trabajo colaborativo PIE** (rosado, una burbuja),
    5) **reuniones externas** (gris, una burbuja).
  - *Talleres y reforzamientos:* al final del día, en dos sub-filas (reforzamiento y talleres) alineadas entre días.
  Las barras de sección son finas y discretas; mandan los días de la semana. Ya no hay franja de foco / consejo /
  reunión lineal. Los talleres se nombran sin la palabra "Taller" ("Ajedrez - 2° ciclo").
  Cada evento tiene una `seccion` (ESTUDIANTES, FUNCIONARIOS o EXTERNAS) y la marca `especial` (casilla *Nota especial*:
  plazos, feriados, cambios de horario), que lo pone primero y en rojo dentro de **su** sección. Dentro de cada sección,
  las actividades **sin horario van primero** y luego por hora.
- **Hito vs. detalle:** un mismo evento se ve distinto según la vista. *SIMCE II° medio* es un bloque en el mensual y, en la
  semana, el PDF y el parte diario, despliega su `detalle`. En la ficha del evento, *Detalle por curso u horario* tiene filas de **hora · curso · actividad ·
  lugar** y **subsecciones** (p. ej. una por ciclo) que se separan con línea punteada. Si cada curso tiene su horario,
  se deja vacío el *Horario* general y la primera línea de la burbuja no muestra hora.
  Las actividades que solo existen en la semana tienen `mensual = NO`.
- **Semana:** numeración por Semana de Clases oficial (los recesos no cuentan), foco, consejo y reunión lineal editables,
  eventos arrastrables entre días y entre Mañana/Tarde, matriz permanente al pie, boletín del viernes.
  **Modo edición** (botón en la cabecera): cada actividad muestra controles de un clic para moverla de día (◀ ▶), cambiarla
  de jornada, editarla o eliminarla (con *Deshacer*), y marca en amarillo los posibles duplicados del mismo día.
  **PDF carta** descarga el calendario semanal en tamaño carta apaisado para adjuntar al correo.
  **Cumpleaños de la semana**: se agregan con nombre, día y mes (hoja `09_Cumpleanos`), y salen en el boletín y el PDF.
- **Calendario mensual:** solo actividades específicas, con su hora (si solo está en el detalle, el rango con
  "varios horarios"). La rutina semanal se puede mostrar opcionalmente con *Mostrar rutina semanal*.
- **Semana:** ordenada como la planilla del colegio, en filas: *Actividades estudiantes*, *Actividades funcionarios*
  (incluye las reuniones fijas), *Talleres y reforzamientos*, *Reuniones y acciones externas* y *Cumpleaños*.
  Cada evento tiene una **sección** (`seccion` = ESTUDIANTES, FUNCIONARIOS o EXTERNAS). Los eventos antiguos sin sección
  se ubican automáticamente según su origen y título; se corrige arrastrándolos o en *Modo edición*.
- **Eventos:** el formulario pide solo actividad, fecha, horario, sección y si aparece en el mensual; el resto (detalle hora a hora, jornada,
  área, cursos, espacio, responsable) está en *Todos los detalles*. Escribir el horario ajusta la jornada sola (desde las 14:00 = tarde).
- **Limpieza (Ajustes):** *Revisar y unir repetidos* une un hito del mensual con la actividad semanal del mismo día y
  nombre: queda el hito (con su nombre) y recibe la hora y el detalle de la semana.
- **PDF carta:** siempre una sola hoja carta apaisada, con las mismas barras y burbujas que la vista Semana. Pensado para
  imprimir: las burbujas llevan solo el borde de color (sin relleno) y el interlineado es más amplio. Tipografía Outfit
  incrustada (Helvetica si no carga); licencia en `vendor/OFL-Outfit.txt`.
- **Cumpleaños:** hoja `09_Cumpleanos` (nombre, día y mes). Se cargan con los listados de docentes y asistentes del
  Mineduc (.csv) en *Agregar desde archivos originales*; del listado **no se guarda el RUN ni el año de nacimiento**. Si una semana viene muy cargada, achica la letra, acorta los
  detalles y, como último recurso, indica "+N más" en la celda.
- **Calendario:** marzo a diciembre; cada evento es independiente y se arrastra entre días. En celular: mantener pulsado y arrastrar.
- **Horarios:** Ciclo → Curso, por docente/PIE, y sábana comparativa. Muestra alertas de eventos del curso y ausencias de la semana.
- **Espacios:** por edificio, con capacidad, encargado, ocupación por bloque y aviso de choques al reservar.
- **Ajustes:** CRUD de funcionarios, cursos, espacios, matriz fija y semanas lectivas; cargar/descargar la base unificada.

## Límites y pendientes conocidos

- El backend se probó con un simulador local de Apps Script (`tests/`), **no** contra un despliegue real de Google: haz una
  prueba con dos cuentas tras el paso 8.
- Los lectores del Calendario Anual y del Calendario Semanal se verificaron con los archivos reales 2026 del colegio.
  Ambos son planillas de formato libre: revisa el resultado tras importar. En el semanal, las semanas 1–12 (una celda de texto
  por día) se separan por líneas y pueden quedar partidas de forma imperfecta.
- El anual y el semanal repiten algunos hitos con redacción distinta (p. ej. "SIMCE 2° MEDIO" / "SIMCE II° MEDIO"): quedan
  como dos eventos; el campo *Tipo de evento* indica el origen ("Calendario anual" / "Calendario semanal").
- Importar el Calendario Semanal **reemplaza** los Talleres ACLE y Reforzamientos de la matriz permanente por los de la
  semana más reciente del archivo (las reuniones fijas no se tocan). La sección de cumpleaños no se importa.
- Incrustada en Google Sites, algunos navegadores bloquean el inicio de sesión de Google dentro de iframes; en ese caso
  usa un enlace que abra la app en pestaña propia.
- Ediciones manuales en la planilla: una fila a la vez y sin tocar la columna `id` (la función `onEdit` las propaga).
- Dos personas editando **la misma fila** a la vez: gana la última en guardar. Filas distintas nunca se pisan.
- No implementado aún: sincronización con Google Calendar, envío automático de correos/WhatsApp.
- `vendor/jspdf.min.js` es jsPDF 4.2.1 (npm). El PDF usa la tipografía estándar Helvetica: los emojis se omiten.
- `vendor/xlsx.min.js` es SheetJS 0.20.3 (copia de npm `@e965/xlsx`); puedes reemplazarlo por el oficial de cdn.sheetjs.com.

## Pruebas

```bash
python3 -m http.server 8765 &            # app en modo local
node tests/mock-backend.js &             # simulador de Apps Script en :8766
node tests/features.test.js BD.xlsx /tmp # arrastre, importación, choques, base unificada (BD = planilla original BD_AppSheet)
node tests/sync.test.js BD.xlsx          # multiusuario, roles y seguridad
node tests/semana.test.js Base_Unificada.xlsx /tmp  # modo edición, cumpleaños y PDF
node tests/calendario.test.js Base_Unificada.xlsx /tmp  # mensual, formulario, repetidos y PDF de 1 hoja (44 semanas)
```
(requieren Playwright).
