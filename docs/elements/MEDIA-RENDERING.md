# Media element rendering

The media element definitions are rendered from validated document properties by the PHP definition renderer. Attachment-backed images, video, audio and WebVTT captions are resolved by the WordPress media adapter; saved author URLs are not used for these fields.

## External embeds and maps

`embed` and `iframe` accept HTTP(S) URLs and render a lazy iframe inside a sandbox that does not grant same-origin access. A labelled link remains available below the frame. `pdf-viewer` applies the same sandbox and only renders paths ending in `.pdf`; other URLs produce the missing-media fallback.

Maps default to `consentRequired: true`. In that mode the page renders a load button and an external map link without contacting a map provider. The frontend runtime creates an iframe only after the visitor activates the button, and it accepts only the OpenStreetMap and Google Maps hosts. Mapbox currently uses its external link fallback because the element does not configure an API token. Coordinates, zoom, labels and marker count are bounded and validated; marker locations also appear as keyboard-accessible external links.

## Video backgrounds

Video backgrounds resolve an approved WordPress video attachment and optional image poster. They render native video with inline playback, metadata preload, and decorative `aria-hidden` treatment when controls and an accessible label are absent. Autoplay forces muted playback. Captions render only when the selected attachment resolves as `text/vtt`; the track language follows the WordPress site locale.
