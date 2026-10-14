<?php
/**
 * Preview tree limits.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Preview;

\defined( 'ABSPATH' ) || exit;

/** Validates structural limits independently of the replaceable schema validator. */
final class PreviewDocument {
	/** Check the element tree with bounded iterative traversal.
	 *
	 * @param \stdClass $document Document envelope.
	 */
	public static function accepts( \stdClass $document ): bool {
		if ( ! isset( $document->root ) || ! \is_array( $document->root ) || ! \array_is_list( $document->root ) ) {
			return false;
		}
		$stack = [];
		foreach ( $document->root as $node ) {
			$stack[] = [ $node, 1 ];
		}
		$count = 0;
		$ids   = [];
		while ( [] !== $stack ) {
			[ $node, $depth ] = \array_pop( $stack );
			if ( ! $node instanceof \stdClass || ! isset( $node->id, $node->type, $node->children ) || ! \is_string( $node->id ) || ! \is_string( $node->type ) || ! \is_array( $node->children ) || ! \array_is_list( $node->children ) || '' === $node->id || isset( $ids[ $node->id ] ) || $depth > 32 || ++$count > 5000 ) {
				return false;
			}
			$ids[ $node->id ] = true;
			foreach ( $node->children as $child ) {
				$stack[] = [ $child, $depth + 1 ];
			}
		}
		return true;
	}
}
