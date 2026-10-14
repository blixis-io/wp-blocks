<?php
/**
 * Builder lifecycle hooks.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder;

use Blixis\Builder\Storage\MetaRegistration;

\defined( 'ABSPATH' ) || exit;

/**
 * Registers the bootstrap hooks.
 */
final class Plugin {

	/** Register hooks for a supported runtime. */
	public static function register(): void {
		\add_action( 'init', [ self::class, 'load_text_domain' ] );
		MetaRegistration::hooks();
	}

	/** Load translations after WordPress has initialized. */
	public static function load_text_domain(): void {
		\load_plugin_textdomain( 'blixis-builder', false, \dirname( \plugin_basename( FILE ) ) . '/languages' );
	}
}
