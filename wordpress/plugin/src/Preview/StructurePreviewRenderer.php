<?php
/**
 * Safe structural preview pending registry rendering.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Preview;

\defined( 'ABSPATH' ) || exit;

/** Emits only div nesting and safe data attributes; no props, text or CSS yet. */
final class StructurePreviewRenderer implements PreviewRenderer {
	/** Render a bounded tree without PHP call-stack recursion.
	 *
	 * @param \stdClass $document Validated document.
	 * @param string    $locale Content locale.
	 * @param string    $mode Website appearance mode.
	 */
	public function render( \stdClass $document, string $locale, string $mode ): PreviewOutput {
		$html  = '';
		$stack = [];
		foreach ( \array_reverse( $document->root ) as $node ) {
			$stack[] = $node;
		}
		while ( [] !== $stack ) {
			$node = \array_pop( $stack );
			if ( null === $node ) {
				$html .= '</div>';
				continue;
			}
			$id   = $node->id ?? null;
			$type = $node->type ?? null;
			if ( \is_string( $id ) && \is_string( $type ) && 1 === \preg_match( '/^[A-Za-z0-9_.:\/-]{1,64}$/D', $id ) && 1 === \preg_match( '/^[A-Za-z0-9_.:\/-]{1,64}$/D', $type ) ) {
				$html .= '<div data-blx-id="' . \htmlspecialchars( $id, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' ) . '" data-blx-type="' . \htmlspecialchars( $type, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' ) . '">';
			} else {
				$html .= '<div data-blx-invalid>';
			}
			$stack[] = null;
			foreach ( \array_reverse( $node->children ) as $child ) {
				$stack[] = $child;
			}
		}
		return new PreviewOutput( $html, '' );
	}
}
