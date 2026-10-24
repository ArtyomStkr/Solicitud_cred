# JOSU · Solicitud de crédito

Formulario React + TypeScript para completar una plantilla ODS fija. No requiere cuentas ni servidor de datos. Los datos ingresados se procesan en el navegador y el borrador se guarda en localStorage.

```sh
npm ci
npm run dev
```

```sh
npm test
npm run build
npm run preview
```

La plantilla pública `public/plantilla.ods` está vacía. El documento privado de origen está excluido de Git. La exportación modifica únicamente las celdas de entrada y las cachés de las fórmulas vinculadas. Conserva estilos, combinaciones, dimensiones, fórmulas y recursos de la plantilla pública. Los mapas del expediente de ejemplo se sustituyeron por imágenes vacías.

Las hojas auxiliares con campos que no están vinculados a Información general quedan vacías para completarlas cuando corresponda. Los cálculos financieros independientes se conservan como fórmulas de la plantilla y requieren su revisión en Calc. No se ofrece conversión XLSX en esta versión. Las pruebas verifican la estructura y el contenido XML; la identidad visual impresa entre aplicaciones ofimáticas todavía requiere comparación en LibreOffice.

El logo cuadrado se dibuja con Canvas 2D en `src/logo.ts`. Las variantes originales están en `public/josu-dia.png` y `public/josu-noche.png` (1024 × 1024); el favicon y los iconos de instalación derivan del mismo dibujo.

La aplicación incluye manifest y un service worker que conserva los recursos estáticos para usarlos sin conexión tras una primera carga completa. La instalación depende de las opciones del navegador. El flujo de GitHub Actions prueba y publica `dist` en GitHub Pages al actualizar `main`.

Bibliotecas: [React](https://react.dev/), [Vite](https://vite.dev/), [fflate](https://github.com/101arrowz/fflate), [Lucide](https://lucide.dev/). [Documentación de Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
