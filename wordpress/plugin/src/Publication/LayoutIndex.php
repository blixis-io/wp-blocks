<?php
/**
 * Element ids and types of a layout.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Publication;

\defined( 'ABSPATH' ) || exit;

/** A bounded, iterative walk (no recursion on untrusted depth). */
final class LayoutIndex {
	private const MAX_NODES = 5000;

	/**
	 * Map element id to element type.
	 *
	 * @param \stdClass $layout Layout document.
	 * @return array<string, string>
	 */
	public static function types( \stdClass $layout ): array {
		$types = [];
		$stack = \is_array( $layout->root ?? null ) ? \array_reverse( $layout->root ) : [];
		$count = 0;
		while ( [] !== $stack ) {
			$node = \array_pop( $stack );
			if ( ! $node instanceof \stdClass || ++$count > self::MAX_NODES || ! \is_string( $node->id ?? null ) || ! \is_string( $node->type ?? null ) ) {
				continue;
			}
			$types[ $node->id ] = $node->type;
			if ( \is_array( $node->children ?? null ) ) {
				foreach ( \array_reverse( $node->children ) as $child ) {
					$stack[] = $child;
				}
			}
		}
		return $types;
	}
}
