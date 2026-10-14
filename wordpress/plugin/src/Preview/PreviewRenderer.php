<?php
/**
 * Preview renderer extension point.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Preview;

\defined( 'ABSPATH' ) || exit;

/** BWB-043/044 can replace the structural renderer without changing REST policy. */
interface PreviewRenderer {
	/** Render an already validated document for independent content locale and website mode.
	 *
	 * @param \stdClass $document Validated document.
	 * @param string    $locale Content locale.
	 * @param string    $mode Website appearance mode.
	 */
	public function render( \stdClass $document, string $locale, string $mode ): PreviewOutput;
}
