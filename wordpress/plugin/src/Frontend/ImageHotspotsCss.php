<?php
/** Accessible image hotspot styling.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Frontend;

\defined( 'ABSPATH' ) || exit;

/** Minimal responsive styles for image hotspot markers. */
final class ImageHotspotsCss {
	/** Return styles used by the hotspot view.
	 *
	 * @return string CSS.
	 */
	public static function css(): string {
		return '[data-blx-image-hotspots] .blx-hotspots-canvas{position:relative}'
			. '[data-blx-image-hotspots] .blx-hotspots-canvas img{display:block;width:100%;height:auto}'
			. '[data-blx-image-hotspots] .blx-hotspots-canvas ol{position:absolute;inset:0;margin:0;padding:0;list-style:none}'
			. '[data-blx-image-hotspots] .blx-hotspots-canvas li{position:absolute;left:var(--blx-hotspot-x);top:var(--blx-hotspot-y);display:grid;place-items:center;width:2rem;height:2rem;transform:translate(-50%,-50%);border-radius:50%;background:var(--wp--preset--color--primary,#1d4ed8);color:#fff;font:600 .875rem/1 system-ui,sans-serif;box-shadow:0 1px 4px #0008}'
			. '[data-blx-image-hotspots]>ol{display:flex;flex-wrap:wrap;gap:.5rem 1rem;padding-inline-start:1.25rem}'
			. '[data-blx-image-hotspots] a:focus-visible{outline:2px solid currentColor;outline-offset:2px}';
	}
}
