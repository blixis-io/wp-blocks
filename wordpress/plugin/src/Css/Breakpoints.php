<?php
/**
 * Breakpoint registry used by the CSS compiler.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Css;

\defined( 'ABSPATH' ) || exit;

/** Validates the ordered, nested max-width registry. */
final class Breakpoints {
	/**
	 * The default registry: base, tablet 1024, mobile 640.
	 *
	 * @var list<array{id: string, maxWidth: ?int}>
	 */
	public const DEFAULT_REGISTRY = [
		[
			'id'       => 'base',
			'maxWidth' => null,
		],
		[
			'id'       => 'tablet',
			'maxWidth' => 1024,
		],
		[
			'id'       => 'mobile',
			'maxWidth' => 640,
		],
	];

	/**
	 * Validate a registry.
	 *
	 * @param list<array{id: string, maxWidth: ?int}> $registry Registry.
	 * @return ?string Error, or null.
	 */
	public static function validate( array $registry ): ?string {
		if ( ! isset( $registry[0] ) || 'base' !== $registry[0]['id'] || null !== $registry[0]['maxWidth'] ) {
			return 'the first breakpoint must be base without a width';
		}
		$seen     = [ 'base' => true ];
		$previous = PHP_INT_MAX;
		foreach ( array_slice( $registry, 1 ) as $bp ) {
			$id = $bp['id'];
			if ( 1 !== preg_match( '/^[a-z][a-z0-9-]{0,31}$/D', $id ) || isset( $seen[ $id ] ) ) {
				return 'invalid or repeated breakpoint id "' . $id . '"';
			}
			$seen[ $id ] = true;
			$width       = $bp['maxWidth'];
			if ( ! is_int( $width ) || $width < 1 || $width > 10000 || $width >= $previous ) {
				return 'breakpoint "' . $id . '" needs an integer max-width below the previous one';
			}
			$previous = $width;
		}
		return null;
	}
}
