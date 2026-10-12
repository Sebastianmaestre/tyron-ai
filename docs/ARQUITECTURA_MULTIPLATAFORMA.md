# TYRON AI — arquitectura multiplataforma

## Objetivo
Crear una aplicación instalable para plataformas compatibles y permitir conexiones explícitas a dispositivos propios. Las acciones sensibles requieren confirmación del usuario.

## Arquitectura por etapas

1. **Interfaz compartida:** React + TypeScript + Vite. Mantener el HTML actual operativo mientras se migra por componentes, sin reemplazarlo de golpe.
2. **Aplicación móvil:** Capacitor para Android e iOS, sujeto a las APIs y permisos de cada sistema.
3. **Aplicación de escritorio:** evaluar Tauri para Linux, Windows y macOS. Las capacidades locales se exponen mediante comandos específicos y validados, no mediante ejecución arbitraria.
4. **Backend:** Node.js/Express como puerta de enlace a Gemini. La clave de Gemini solo vive en variables de entorno del servidor.
5. **Agentes de dispositivo:** servicio independiente por sistema, emparejado explícitamente, autenticado y con permisos mínimos.
6. **Conexión remota:** HTTPS, identidad de dispositivo, revocación de sesiones y canales autenticados. No exponer puertos de dispositivos directamente a Internet.
7. **Acciones y consentimiento:** clasificar cada acción; mostrar vista previa y pedir confirmación para borrar/modificar datos, ejecutar comandos, instalar software o cambiar ajustes de red.
8. **Redes:** empezar con inventario y diagnóstico de redes propias y APIs autorizadas. No eludir permisos, controles de acceso o mecanismos de seguridad.

## Primer hito
- Backend Gemini separado del cliente.
- Preparación para CORS restringido al origen configurado.
- Límite de solicitudes por IP en el endpoint de chat (se aplicará en el backend antes de publicar el puerto).
- Archivo `.env.example` sin secretos y reglas Git para ignorar `.env` y dependencias.

## Variables del backend
Copiar `backend/.env.example` a `backend/.env` localmente y definir `GEMINI_API_KEY`. Nunca subir `backend/.env` al repositorio ni incluir la clave en HTML, JavaScript del cliente, APK o instaladores.

## Próximos hitos
- Añadir y probar CORS y rate limiting en el servidor.
- Conectar el cliente al backend HTTPS desplegado.
- Migrar la interfaz existente a React sin perder funciones.
- Añadir autenticación y emparejamiento de dispositivos antes de habilitar comandos remotos.
- Crear agente local de escritorio con una lista cerrada de operaciones permitidas.
- Añadir empaquetado y pruebas por plataforma.

## Limitaciones reales
Ninguna app obtiene acceso total a todos los dispositivos automáticamente. Android, iOS y los sistemas de escritorio imponen permisos distintos. Algunas funciones requieren componentes instalados, consentimiento del usuario y herramientas de compilación específicas.
