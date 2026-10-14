<?php
/** Core preview adapter.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Preview;

use Blixis\Builder\Registry\ElementRegistry;
use Blixis\Builder\Render\CoreDocumentRenderer;
use Blixis\Builder\Render\MediaResolver;
use Blixis\Builder\Render\WordPressMediaResolver;

\defined( 'ABSPATH' ) || exit;

/** Renders core semantic HTML; CSS compilation arrives with BWB-044. */
final class CoreElementPreviewRenderer implements PreviewRenderer {
	/**
	 * Core document renderer.
	 *
	 * @var CoreDocumentRenderer
	 */
	private readonly CoreDocumentRenderer $renderer;
	/**
	 * Apply the documented contract.
	 *
	 * @param ?ElementRegistry $registry Registry.
	 * @param ?MediaResolver   $media Media.
	 */
	public function __construct( ?ElementRegistry $registry = null, ?MediaResolver $media = null ) {
		$this->renderer = new CoreDocumentRenderer( $registry ?? ElementRegistry::from_manifest_file( \dirname( __DIR__, 2 ) . '/data/core-elements.json' ), $media ?? new WordPressMediaResolver() );
	}
	/**
	 * Render escaped element HTML.
	 *
	 * @param \stdClass $document Document.
	 * @param string    $locale Locale.
	 * @param string    $mode Mode.
	 */
	public function render( \stdClass $document, string $locale, string $mode ): PreviewOutput {
		return new PreviewOutput( $this->renderer->render( $document, $locale, $mode ), '' );
	}
}
