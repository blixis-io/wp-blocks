<?php
/**
 * Preview test fixture.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Rest;

use Blixis\Builder\Preview\PreviewOutput;
use Blixis\Builder\Preview\PreviewRenderer;

/** Test arbitrary renderer output. */
final class FakePreviewRenderer implements PreviewRenderer {
	/** Construct a renderer with arbitrary output.
	 *
	 * @param string $html HTML fragment.
	 * @param string $css Compiled CSS.
	 */
	public function __construct( private string $html, private string $css ) {}
	/** Return configured output.
	 *
	 * @param \stdClass $document Validated document.
	 * @param string    $locale Content locale.
	 * @param string    $mode Website mode.
	 */
	public function render( \stdClass $document, string $locale, string $mode ): PreviewOutput {
		return new PreviewOutput( $this->html, $this->css );
	}
}
