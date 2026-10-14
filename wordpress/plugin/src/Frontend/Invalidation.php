<?php
/**
 * Site-wide cache epoch.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Frontend;

\defined( 'ABSPATH' ) || exit;

/**
 * Anything that changes every rendered page (design tokens, global classes, theme, media) bumps the epoch, which is part
 * of every cache key. Per-post changes need no hook: they change the published revision numbers in the key.
 */
final class Invalidation {
	public const OPTION = 'blixis_builder_epoch';

	/** Register the hooks that bump the epoch. */
	public static function hooks(): void {
		foreach ( [ 'blixis_design_system', 'blixis_global_classes' ] as $option ) {
			\add_action( 'add_option_' . $option, [ self::class, 'bump' ] );
			\add_action( 'update_option_' . $option, [ self::class, 'bump' ] );
			\add_action( 'delete_option_' . $option, [ self::class, 'bump' ] );
		}
		\add_action( 'switch_theme', [ self::class, 'bump' ] );
		\add_action( 'attachment_updated', [ self::class, 'bump' ] );
		\add_action( 'delete_attachment', [ self::class, 'bump' ] );
	}

	/** Current epoch; created on first use. */
	public static function epoch(): string {
		$value = \get_option( self::OPTION, '' );
		if ( \is_string( $value ) && '' !== $value ) {
			return $value;
		}
		return self::new_epoch();
	}

	/** Start a new epoch from a hook (hooks ignore return values). */
	public static function bump(): void {
		self::new_epoch();
	}

	/**
	 * Start a new epoch: a random value, so no race between two writers can reuse an old one.
	 *
	 * @return string The new epoch.
	 */
	private static function new_epoch(): string {
		$value = \wp_generate_uuid4();
		\update_option( self::OPTION, $value, true );
		return $value;
	}
}
