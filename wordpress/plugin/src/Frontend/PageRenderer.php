<?php
/**
 * Renders HTML and CSS for a published document.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Frontend;

use Blixis\Builder\Css\Compiler;
use Blixis\Builder\Preview\PreviewSanitizer;
use Blixis\Builder\Render\CoreDocumentRenderer;

\defined( 'ABSPATH' ) || exit;

/** Produces the sanitized fragment and its compiled stylesheet. */
final class PageRenderer {
	private const MAX_HTML = 1048576;
	private const MAX_CSS  = 262144;

	/**
	 * Create a renderer.
	 *
	 * @param CoreDocumentRenderer $renderer Element renderer.
	 */
	public function __construct( private readonly CoreDocumentRenderer $renderer ) {}

	/**
	 * Render a published document.
	 *
	 * @param PublishedDocument $published Document.
	 * @param string            $fallback Missing-translation policy.
	 * @return ?array{html: string, css: string} Null when the output is unsafe or too large.
	 */
	public function render( PublishedDocument $published, string $fallback = 'source' ): ?array {
		$compiled = Compiler::compile( $published->document );
		$html     = $this->renderer->render( $published->document, $published->locale, 'light', $compiled->class_names, $fallback );
		if ( \strlen( $html ) > self::MAX_HTML || ! PreviewSanitizer::accepts( $html ) ) {
			return null;
		}
		$css = $compiled->css;
		// The compiler emits declarations from an allow-list, so '<' cannot occur; refuse it anyway (style element breakout).
		if ( \strlen( $css ) > self::MAX_CSS || \str_contains( $css, '<' ) ) {
			return null;
		}
		return [
			'html' => $html,
			'css'  => $css,
		];
	}
}
