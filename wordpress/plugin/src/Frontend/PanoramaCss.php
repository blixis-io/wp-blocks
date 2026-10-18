<?php
/** Responsive panorama viewer styling.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Frontend;

\defined( 'ABSPATH' ) || exit;

/** Minimal styles for the horizontal panorama viewer. */
final class PanoramaCss {
	/** Return styles used by panorama images.
	 *
	 * @return string CSS.
	 */
	public static function css(): string {
		return '[data-blx-panorama-viewer]{width:100%;max-height:min(70vh,40rem);overflow:auto;overscroll-behavior-inline:contain;cursor:grab;touch-action:pan-x pan-y}'
			. '[data-blx-panorama-viewer]:active{cursor:grabbing}'
			. '[data-blx-panorama-viewer]:focus-visible{outline:2px solid currentColor;outline-offset:2px}'
			. '[data-blx-panorama-viewer] img{display:block;max-width:none;height:auto;max-height:min(70vh,40rem)}'
			. '[data-blx-panorama-instructions]{font-size:.875em}';
	}
}
