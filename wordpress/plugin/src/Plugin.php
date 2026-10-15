<?php
/**
 * Builder lifecycle hooks.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder;

use Blixis\Builder\Frontend\Frontend;
use Blixis\Builder\Storage\MetaRegistration;
use Blixis\Builder\Rest\DocumentController;
use Blixis\Builder\Rest\MediaController;
use Blixis\Builder\Rest\StatusController;
use Blixis\Builder\Theme\AdminNotice;

\defined( 'ABSPATH' ) || exit;

/**
 * Registers the bootstrap hooks.
 */
final class Plugin {

	/** Register hooks for a supported runtime. */
	public static function register(): void {
		\add_action( 'init', [ self::class, 'load_text_domain' ] );
		MetaRegistration::hooks();
		\add_action( 'rest_api_init', [ DocumentController::class, 'register' ] );
		\add_action( 'rest_api_init', [ MediaController::class, 'register' ] );
		\add_action( 'rest_api_init', [ StatusController::class, 'register' ] );
		AdminNotice::hooks();
		Frontend::hooks();
	}

	/** Load translations after WordPress has initialized. */
	public static function load_text_domain(): void {
		\load_plugin_textdomain( 'blixis-builder', false, \dirname( \plugin_basename( FILE ) ) . '/languages' );
	}
}
