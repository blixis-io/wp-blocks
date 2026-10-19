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
use Blixis\Builder\Rest\FormSubmissionController;
use Blixis\Builder\Templates\FontCollection;
use Blixis\Builder\Admin\AdminMenu;

\defined( 'ABSPATH' ) || exit;

/**
 * Registers the bootstrap hooks.
 */
final class Plugin {

	/** Register hooks for a supported runtime. */
	public static function register(): void {
		add_filter( 'blixis_builder_setup_templates', [ self::class, 'setup_templates' ] );
		add_filter(
			'blixis_builder_setup_import',
			static function ( $previous, string $id, array $options ) {
				return ( new \Blixis\Builder\Templates\Importer() )->import( $id, $options );
			},
			10,
			3
		);
		add_filter( 'blixis_builder_templates_admin_url', static fn() => admin_url( 'admin.php?page=blixis-templates' ) );
		add_action( 'admin_post_blixis_install_template_fonts', [ TemplateController::class, 'admin_install' ] );
		FormSubmissionController::hooks();
		\add_filter( 'blixis_builder_admin_menu_slug', static fn() => AdminMenu::SLUG );
		AdminMenu::hooks();
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

	/** Expose the validated catalogue to compatible themes without making them depend on plugin classes.
	 *
	 * @param mixed $templates Existing provider entries.
	 * @return list<array<string, mixed>>
	 */
	public static function setup_templates( mixed $templates ): array {
		$templates = [];
		foreach ( \Blixis\Builder\Templates\Library::instance()->all() as $card ) {
			$data                         = $card->data;
			$data['designTokens']         = \Blixis\Builder\Templates\Library::instance()->tokens( $data['id'] );
			$data['importabilityReasons'] = [];
			$data['importOptions']        = json_decode( (string) file_get_contents( $card->directory . '/template.json' ), true )['importOptions'] ?? []; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Read the already validated local pack file.
			$data['documents']            = [];
			$documents                    = json_decode( (string) file_get_contents( $card->directory . '/template.json' ), true )['documents'] ?? []; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Read the already validated local pack file.
			foreach ( $documents as $document ) {
				$data['importabilityReasons'] = array_merge( $data['importabilityReasons'], $document['importabilityReasons'] ?? [] );
				$data['documents'][]          = [
					'id'                   => $document['id'],
					'type'                 => $document['type'],
					'title'                => $document['title'],
					'importable'           => $document['importable'],
					'importabilityReasons' => $document['importabilityReasons'],
				];
			}
			$templates[] = $data;
		}
		return $templates;
	}

	/** Load translations after WordPress has initialized. */
	public static function load_text_domain(): void {
		\load_plugin_textdomain( 'blixis-builder', false, \dirname( \plugin_basename( FILE ) ) . '/languages' );
	}
}
