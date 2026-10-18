<?php
/** Responsive map frame styling.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Frontend;

\defined( 'ABSPATH' ) || exit;

/** Minimal responsive styles for map frames. */
final class MapCss {
	/** Return the styles used by maps.
	 *
	 * @return string CSS.
	 */
	public static function css(): string {
		return '.blx-map-frame{display:block;width:100%;height:min(65vh,36rem);min-height:20rem;border:0}'
			. '[data-blx-map]>a{display:inline-block;margin-block-start:.5rem}'
			. '[data-blx-map-load]:focus-visible{outline:2px solid currentColor;outline-offset:2px}';
	}
}
