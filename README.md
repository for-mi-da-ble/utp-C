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

## Puesta en marcha con varios usuarios (≈20 minutos)

1. **Planilla.** Crea una Google Sheet vacía (p. ej. "SIG-UTP Base de datos"). *Extensiones → Apps Script*, borra el contenido,
   pega `apps-script/Code.gs`, guarda, elige la función `instalar` y pulsa **Ejecutar** (acepta los permisos).
   Se crean las hojas y quedas como `admin` en la hoja `usuarios`.
2. **ID de cliente Google.** En <https://console.cloud.google.com> crea un proyecto → *APIs y servicios → Credenciales →
   Crear credenciales → ID de cliente de OAuth → Aplicación web*. En **Orígenes autorizados de JavaScript** agrega
   `https://TU-USUARIO.github.io`. Copia el ID (termina en `.apps.googleusercontent.com`).
   Si pide configurar la pantalla de consentimiento: tipo *Interno* si usan Google Workspace.
3. **Conecta el script con ese ID.** En Apps Script: *Configuración del proyecto → Propiedades de la secuencia de comandos* →
   edita `GOOGLE_CLIENT_ID` y pega el ID.
4. **Publica la API.** *Implementar → Nueva implementación → Aplicación web* · Ejecutar como: **Yo** · Quién tiene acceso:
   **Cualquier usuario**. Copia la URL que termina en `/exec`.
   ("Cualquier usuario" solo permite *llamar* a la API; sin un token válido de una cuenta autorizada responde error y no entrega datos.)
5. **Configura la app.** Edita `config.js` con `API_URL` (la URL `/exec`) y `GOOGLE_CLIENT_ID`. No son secretos.
6. **GitHub Pages.** Sube esta carpeta a un repositorio → *Settings → Pages → Deploy from a branch → main / (root)*.
7. **Carga inicial.** Abre `https://TU-USUARIO.github.io/REPO/`, inicia sesión y en *Ajustes → Cargar base unificada*
   elige `SIG-UTP_Base_Unificada_2026.xlsx`. Se sube completa a la planilla de Google.
8. **Usuarios.** Agrega filas en la hoja `usuarios`: `correo | rol` (`admin`, `editor` o `lector`). Los cambios aplican en ≤2 minutos.

Al cambiar `Code.gs` más adelante: *Implementar → Administrar implementaciones → Editar → Versión nueva* (mantiene la misma URL).

## Uso diario

- **Hoy:** botón *Registrar ausencia* → al elegir el docente se ven de inmediato los bloques que deja sin atender y quién
  puede cubrir (No lectivo / Aula de recursos PIE, ordenados por quien lleva menos reemplazos en el mes). Un toque asigna.
  *Generar parte de las 08:00* arma el texto y la tabla para Gmail o WhatsApp.
- **Semana:** numeración por Semana de Clases oficial (los recesos no cuentan), foco, consejo y reunión lineal editables,
  eventos arrastrables entre días y entre Mañana/Tarde, matriz permanente al pie, boletín del viernes.
  **Modo edición** (botón en la cabecera): cada actividad muestra controles de un clic para moverla de día (◀ ▶), cambiarla
  de jornada, editarla o eliminarla (con *Deshacer*), y marca en amarillo los posibles duplicados del mismo día.
  **PDF carta** descarga el calendario semanal en tamaño carta apaisado para adjuntar al correo.
  **Cumpleaños de la semana**: se agregan con nombre, día y mes (hoja `09_Cumpleanos`), y salen en el boletín y el PDF.
- **Calendario mensual:** muestra solo los **hitos** (`mensual = SI`), que son los eventos del Calendario Anual, cada uno
  como un bloque con su nombre. Cargar de nuevo el Calendario Anual **sincroniza** el mensual con el archivo: agrega lo nuevo,
  quita lo eliminado y conserva el detalle semanal de lo que sigue igual. La rutina semanal se puede mostrar con un botón.
- **Hito vs. detalle:** un mismo evento se ve distinto según la vista. *SIMCE II° medio* es un bloque en el mensual y, en la
  semana, el PDF y el parte diario, despliega su `detalle` hora a hora (una línea por horario: `08:30 Ingreso a sala`).
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
- **PDF carta:** siempre una sola hoja carta apaisada, con las mismas filas que la vista Semana. Si una semana viene muy cargada, achica la letra, acorta los
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
