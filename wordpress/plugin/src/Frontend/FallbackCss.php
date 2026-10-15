<?php
/**
 * Minimal public styling for unsupported themes.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Frontend;

\defined( 'ABSPATH' ) || exit;
/** Static token-aware CSS without document input. */
final class FallbackCss {
	/** Return a byte-stable safe inline stylesheet. */
	public static function css(): string {
		return '@layer blx.theme{.blx-page *,.blx-page *::before,.blx-page *::after{box-sizing:border-box}.blx-page [data-blx-max-width]{width:100%;margin-inline:auto;padding-inline:var(--blx-space-4, 1rem)}.blx-page [data-blx-max-width="narrow"]{max-width:40rem}.blx-page [data-blx-max-width="default"]{max-width:var(--blx-container-content, 60rem)}.blx-page [data-blx-max-width="wide"]{max-width:var(--blx-container-wide, 72rem)}.blx-page [data-blx-max-width="full"]{max-width:100%}.blx-page img{max-width:100%;height:auto}.blx-page .blx-button{display:inline-block;padding:var(--blx-space-2, .5rem) var(--blx-space-4, 1rem);border-radius:var(--blx-radius-sm, .25rem);background:var(--blx-color-primary, #2563eb);color:var(--blx-color-on-primary, #ffffff);text-decoration:none}}';
	}
}
