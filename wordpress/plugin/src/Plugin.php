<?php
/**
 * Builder lifecycle hooks.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder;

use Blixis\Builder\Frontend\Frontend;
use Blixis\Builder\Locale\NativeLocaleRouter;
use Blixis\Builder\Storage\MetaRegistration;
use Blixis\Builder\Rest\DocumentController;
use Blixis\Builder\Rest\MediaController;
use Blixis\Builder\Rest\StatusController;
use Blixis\Builder\Theme\AdminNotice;
use Blixis\Builder\Admin\EditorScreen;
use Blixis\Builder\Admin\CanvasScreen;
use Blixis\Builder\Canvas\PageShell;
use Blixis\Builder\Rest\PageSettingsController;
use Blixis\Builder\Seo\Head;
use Blixis\Builder\Rest\TemplateController;
use Blixis\Builder\Templates\FontCollection;

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
		\add_action( 'rest_api_init', [ PageSettingsController::class, 'register' ] );
		\add_action( 'rest_api_init', [ TemplateController::class, 'register' ] );
		\add_action( 'init', [ FontCollection::class, 'register' ], 20 );
		AdminNotice::hooks();
		EditorScreen::hooks();
		CanvasScreen::hooks();
		PageShell::hooks();
		Frontend::hooks();
		Head::hooks();
		NativeLocaleRouter::boot();
	}

	/** Load translations after WordPress has initialized. */
	public static function load_text_domain(): void {
		\load_plugin_textdomain( 'blixis-builder', false, \dirname( \plugin_basename( FILE ) ) . '/languages' );
	}
}
