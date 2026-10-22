# Contacto de Diseñolys por WhatsApp

El enlace funciona con WhatsApp personal o Business. Abre una conversación con
un mensaje editable; no envía mensajes automáticamente ni necesita una API.

En el **frontend** de Render, configurar `NEXT_PUBLIC_PLATFORM_WHATSAPP_NUMBER`
con el número confirmado por Cristian, en formato internacional y empezando con
`+`. Para un celular argentino: `+54`, `9`, código de área y número sin `15`.
Después, reconstruir y desplegar el frontend: Next.js incorpora esta variable
durante la compilación.

El teléfono será público en el enlace. No cargar números de clientes ni de
otros proyectos. Si falta o tiene un formato inválido, el botón no se muestra.

Ubicaciones: botón flotante en la portada y botón principal en `/contacto`.
No se agrega al layout global: cada tienda conserva su propio contacto.

Verificar en celular y computadora que el enlace abre el número correcto antes
de compartirlo. La URL comienza con `https://wa.me/` y contiene la consulta:
“Hola, quiero información sobre Diseñolys para mi comercio.”
