<?php
/**
 * Blixis top-level administration pages.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Admin;

use Blixis\Builder\Templates\Library;

/** Owns the plugin's top-level menu and its pages. */
final class AdminMenu {
	public const SLUG = 'blixis';
	/** Register the menu and screen hooks. */
	public static function hooks(): void {
		\add_action( 'admin_menu', [ self::class, 'menu' ], 9 );
		\add_action( 'admin_enqueue_scripts', [ self::class, 'assets' ] );
		\add_action( 'admin_init', [ self::class, 'settings' ] );
	}
	/** Register the top-level menu and ordered submenu pages. */
	public static function menu(): void {
		// WordPress requires a base64 SVG data URI for a recolorable custom menu icon.
		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- Required by WordPress for the inline SVG menu icon.
		$icon = 'data:image/svg+xml;base64,' . base64_encode( '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="black" d="M3 2h5v20H3zm7 5 11-5v6l-8 4 8 4v6l-11-5z"/></svg>' );
		add_menu_page( __( 'Blixis', 'blixis-builder' ), __( 'Blixis', 'blixis-builder' ), 'edit_theme_options', self::SLUG, [ self::class, 'setup' ], $icon, 25.5 );
		$items = [
			[ 'blixis-setup', __( 'Setup Wizard', 'blixis-builder' ), 'edit_theme_options', [ self::class, 'setup' ] ],
			[ 'blixis-global-styles', __( 'Global Styles', 'blixis-builder' ), 'edit_theme_options', [ self::class, 'global_styles' ] ],
			[ 'blixis-templates', __( 'Templates', 'blixis-builder' ), 'edit_theme_options', [ self::class, 'templates' ] ],
			[ 'blixis-theme-builder', __( 'Theme Builder', 'blixis-builder' ), 'edit_theme_options', [ self::class, 'theme_builder' ] ],
			[ 'blixis-assets', __( 'Assets', 'blixis-builder' ), 'upload_files', [ self::class, 'assets_page' ] ],
			[ 'blixis-settings', __( 'Settings', 'blixis-builder' ), 'manage_options', [ self::class, 'settings_page' ] ],
			[ 'blixis-help', __( 'Help & Support', 'blixis-builder' ), 'edit_theme_options', [ self::class, 'help' ] ],
		];
		foreach ( $items as [ $slug, $title, $capability, $callback ] ) {
			add_submenu_page( self::SLUG, $title, $title, $capability, $slug, $callback );
		}
		// The top-level page is a second path to the wizard; omit its duplicate child row.
		global $submenu;
		if ( isset( $submenu[ self::SLUG ][0] ) ) {
			array_shift( $submenu[ self::SLUG ] );
		}
	}
	/** Enqueue admin assets only on Blixis screens.
	 *
	 * @param string $hook Current admin page hook.
	 */
	public static function assets( string $hook ): void {
		if ( ! str_starts_with( $hook, 'blixis_page_' ) && 'toplevel_page_blixis' !== $hook ) {
			return; }
		$base = plugins_url( 'assets/admin/', dirname( __DIR__, 2 ) . '/blixis-builder.php' );
		wp_enqueue_style( 'blixis-admin', $base . 'admin.css', [], '1.0.0' );
		if ( in_array( $hook, [ 'blixis_page_blixis-assets', 'blixis_page_blixis-help' ], true ) ) {
			if ( function_exists( 'wp_enqueue_script_module' ) ) {
				wp_enqueue_script_module( 'blixis-assets', $base . 'assets.js', [], '1.0.0' );
			} else {
				wp_enqueue_script( 'blixis-assets', $base . 'assets.js', [], '1.0.0', true );
				wp_script_add_data( 'blixis-assets', 'type', 'module' );
			}
		}
	}
	/** Register the minimal Settings API option. */
	public static function settings(): void {
		register_setting(
			'blixis_admin',
			'blixis_show_setup_notice',
			[
				'type'              => 'boolean',
				'default'           => true,
				'sanitize_callback' => static fn( $value ) => in_array( $value, [ true, 1, '1', 'on' ], true ),
			]
		);
		add_settings_section( 'blixis_admin_main', '', '__return_empty_string', 'blixis-settings' );
		add_settings_field(
			'blixis_show_setup_notice',
			__( 'Show the setup notice in the admin', 'blixis-builder' ),
			static function (): void {
				echo '<input type="hidden" name="blixis_show_setup_notice" value="0" />';
				printf( '<input type="checkbox" name="blixis_show_setup_notice" value="1" %s />', checked( (bool) get_option( 'blixis_show_setup_notice', true ), true, false ) );
			},
			'blixis-settings',
			'blixis_admin_main'
		);
	}
	/** Render the theme wizard, or an honest notice when the theme is inactive. */
	public static function setup(): void {
		if ( class_exists( '\\Blixis\\Theme\\SetupAdmin' ) ) {
			\Blixis\Theme\SetupAdmin::page();
			return; }
		self::placeholder( __( 'Setup Wizard', 'blixis-builder' ), __( 'Activate the Blixis theme to use the setup wizard.', 'blixis-builder' ) );
	}
	/** Render consistent Blixis admin chrome around a page body.
	 *
	 * @param string          $title Page title.
	 * @param callable():void $body Escaped page-body renderer.
	 * @param bool            $view  Whether to show the View Site button.
	 */
	private static function chrome( string $title, callable $body, bool $view = false ): void {
		printf( '<div class="wrap blx-admin"><header class="blx-admin__header"><a class="blx-admin__brand" href="%s"><span aria-hidden="true">◀</span> Blixis</a>%s</header><main class="blx-admin__main"><h1>%s</h1>', esc_url( admin_url( 'admin.php?page=blixis-setup' ) ), $view ? '<a class="button" href="' . esc_url( home_url( '/' ) ) . '" target="_blank" rel="noopener">' . esc_html__( 'View Site', 'blixis-builder' ) . '</a>' : '', esc_html( $title ) );
		$body();
		echo '</main></div>';
	}
	/** Render the honest Global Styles placeholder. */
	public static function global_styles(): void {
		self::chrome(
			__( 'Global Styles', 'blixis-builder' ),
			static function (): void {
				echo '<section class="blx-admin__card"><h2>' . esc_html__( 'Global Styles is coming soon', 'blixis-builder' ) . '</h2><p>' . esc_html__( 'This will let you manage site-wide colors, typography, spacing, radii, shadows, and breakpoints from the validated design tokens shared by your pages.', 'blixis-builder' ) . '</p><p>' . esc_html__( 'The current design-system source is the Blixis theme setup wizard.', 'blixis-builder' ) . ' <a href="' . esc_url( admin_url( 'admin.php?page=blixis-setup' ) ) . '">' . esc_html__( 'Open Setup Wizard', 'blixis-builder' ) . '</a></p></section>';
			},
			true
		); }
	/** Render bundled read-only template cards. */
	public static function templates(): void {
		self::chrome(
			__( 'Templates', 'blixis-builder' ),
			static function (): void {
				echo '<p>' . esc_html__( 'Use templates from the Setup Wizard.', 'blixis-builder' ) . ' <a href="' . esc_url( admin_url( 'admin.php?page=blixis-setup' ) ) . '">' . esc_html__( 'Open Setup Wizard', 'blixis-builder' ) . '</a></p><p>' . esc_html__( 'A template provider is planned; this catalog is read-only.', 'blixis-builder' ) . '</p><div class="blx-admin__grid">';
				self::template_cards( Library::instance()->all() );
				echo '</div>';
			},
			true
		);
	}
	/** Render the honest Theme Builder placeholder. */
	public static function theme_builder(): void {
		self::placeholder( __( 'Theme Builder', 'blixis-builder' ), __( 'Theme Builder is coming soon. It will provide tools for creating and managing reusable site templates.', 'blixis-builder' ) ); }
	/** Render a standard placeholder card.
	 *
	 * @param string $title Page title.
	 * @param string $message Plain text message.
	 */
	private static function placeholder( string $title, string $message ): void {
		self::chrome(
			$title,
			static function () use ( $message ): void {
				echo '<section class="blx-admin__card"><p>' . esc_html( $message ) . '</p></section>';
			},
			true
		);
	}
	/** Render the core Media Library browser surface. */
	public static function assets_page(): void {
		self::chrome(
			__( 'Assets', 'blixis-builder' ),
			static function (): void {
				$labels = [
					/* translators: %d: HTTP status code. */
					'requestFailed'   => __( 'Request failed (%d).', 'blixis-builder' ),
					'invalidResponse' => __( 'The media response was invalid.', 'blixis-builder' ),
					'invalidUrl'      => __( 'The media API must use this site origin.', 'blixis-builder' ),
					/* translators: %d: number of media items loaded. */
					'loaded'          => __( '%d media items loaded.', 'blixis-builder' ),
					/* translators: %s: uploaded filename. */
					'uploading'       => __( 'Uploading %s…', 'blixis-builder' ),
					/* translators: %s: uploaded filename. */
					'uploaded'        => __( '%s uploaded.', 'blixis-builder' ),
					/* translators: 1: filename, 2: error message. */
					'uploadError'     => __( '%1$s: %2$s', 'blixis-builder' ),
					'altText'         => __( 'Alt text', 'blixis-builder' ),
					'untitled'        => __( 'Untitled', 'blixis-builder' ),
					'copyUrl'         => __( 'Copy URL', 'blixis-builder' ),
					'editMedia'       => __( 'Edit in Media Library', 'blixis-builder' ),
					'urlCopied'       => __( 'URL copied.', 'blixis-builder' ),
					'copyError'       => __( 'Could not copy URL.', 'blixis-builder' ),
				];
				$config = wp_json_encode(
					[
						'rest'     => rest_url( 'wp/v2/media' ),
						'editBase' => admin_url( 'post.php' ),
						'nonce'    => wp_create_nonce( 'wp_rest' ),
						'labels'   => $labels,
					]
				);
				echo '<section class="blx-admin__card blx-assets" data-config="' . esc_attr( is_string( $config ) ? $config : '{}' ) . '"><div class="blx-assets__toolbar"><button class="button button-primary" type="button" data-upload>' . esc_html__( 'Upload Files', 'blixis-builder' ) . '</button><input type="file" hidden multiple data-file><div role="tablist" aria-label="' . esc_attr__( 'Media type', 'blixis-builder' ) . '">';
				foreach ( [
					'all'         => __( 'All Assets', 'blixis-builder' ),
					'image'       => __( 'Images', 'blixis-builder' ),
					'audio'       => __( 'Audio', 'blixis-builder' ),
					'video'       => __( 'Video', 'blixis-builder' ),
					'application' => __( 'Documents', 'blixis-builder' ),
				] as $type => $label ) {
					printf( '<button type="button" role="tab" aria-selected="%s" tabindex="%d" data-type="%s">%s</button>', esc_attr( 'all' === $type ? 'true' : 'false' ), 'all' === $type ? 0 : -1, esc_attr( $type ), esc_html( $label ) );
				} echo '</div><label>' . esc_html__( 'Search media', 'blixis-builder' ) . ' <input type="search" data-search /></label><label>' . esc_html__( 'Sort by', 'blixis-builder' ) . ' <select data-sort><option value="date">' . esc_html__( 'Date added', 'blixis-builder' ) . '</option><option value="title">' . esc_html__( 'Title', 'blixis-builder' ) . '</option></select></label><button type="button" class="button" aria-pressed="true" data-view="grid">' . esc_html__( 'Grid view', 'blixis-builder' ) . '</button><button type="button" class="button" aria-pressed="false" data-view="list">' . esc_html__( 'List view', 'blixis-builder' ) . '</button></div><p role="status" aria-live="polite" data-status></p><div class="blx-assets__layout"><div class="blx-assets__items" id="blx-assets-items" role="listbox" aria-label="' . esc_attr__( 'Media items', 'blixis-builder' ) . '" data-items></div><aside class="blx-assets__details" aria-live="polite" data-details>' . esc_html__( 'Select an asset to see its details.', 'blixis-builder' ) . '</aside></div><button type="button" class="button" data-more>' . esc_html__( 'Load more', 'blixis-builder' ) . '</button></section>';
			},
			true
		); }
	/** Render escaped template data without exposing source paths.
	 *
	 * @param array<\Blixis\Builder\Templates\TemplateCard> $cards Template cards.
	 */
	private static function template_cards( array $cards ): void {
		foreach ( $cards as $card ) {
			$data = $card->data;
			echo '<article class="blx-admin__card">';
			if ( '' !== $data['previewUrl'] ) {
				/* translators: %s is the template name. */
				printf( '<img src="%s" alt="%s" loading="lazy" />', esc_url( $data['previewUrl'] ), esc_attr( sprintf( __( '%s preview', 'blixis-builder' ), $data['name'] ) ) ); }
			printf( '<h2>%s</h2><p><strong>%s</strong></p><p>%s</p>', esc_html( $data['name'] ), esc_html( $data['category'] ), esc_html( $data['description'] ) );
			foreach ( $data['fonts'] as $font ) {
				printf( '<p>%s: %s</p>', esc_html( $font['family'] ), esc_html( $font['installed'] ? __( 'Available', 'blixis-builder' ) : __( 'Not installed', 'blixis-builder' ) ) ); }
			echo '</article>';
		}
	}
	/** Render the minimal plugin settings page. */
	public static function settings_page(): void {
		self::chrome(
			__( 'Settings', 'blixis-builder' ),
			static function (): void {
				echo '<section class="blx-admin__card"><form method="post" action="options.php">';
				settings_fields( 'blixis_admin' );
				do_settings_sections( 'blixis-settings' );
				submit_button();
				/* translators: 1: plugin version, 2: theme version. */
				echo '</form><p>' . esc_html( sprintf( __( 'Blixis Builder %1$s · Blixis Theme %2$s', 'blixis-builder' ), self::plugin_version(), wp_get_theme( 'blixis' )->get( 'Version' ) ) ) . '</p><p>' . esc_html__( 'This plugin has no data-deletion option; uninstall removes only its version metadata.', 'blixis-builder' ) . '</p></section>';
			},
			true
		); }
	/** Render support links and safe diagnostics. */
	public static function help(): void {
		self::chrome(
			__( 'Help & Support', 'blixis-builder' ),
			static function (): void {
				$diagnostics = [ 'Blixis Builder ' . self::plugin_version(), 'Blixis Theme ' . wp_get_theme( 'blixis' )->get( 'Version' ), 'WordPress ' . get_bloginfo( 'version' ), 'PHP ' . PHP_VERSION ];
				echo '<section class="blx-admin__card"><ul><li><a href="https://github.com/blixis-io/wp-blocks/tree/main/docs" target="_blank" rel="noopener">' . esc_html__( 'Documentation', 'blixis-builder' ) . '</a></li><li><a href="https://github.com/blixis-io/wp-blocks/issues" target="_blank" rel="noopener">' . esc_html__( 'Issues and support', 'blixis-builder' ) . '</a></li></ul><p>' . esc_html( implode( ' · ', $diagnostics ) ) . '</p><textarea hidden data-diagnostics>' . esc_textarea( implode( "\n", $diagnostics ) ) . '</textarea><button class="button" type="button" data-copy data-copy-success="' . esc_attr__( 'Diagnostics copied.', 'blixis-builder' ) . '">' . esc_html__( 'Copy diagnostics', 'blixis-builder' ) . '</button><span role="status" aria-live="polite" data-copy-status></span></section>';
			},
			true
		); }
	/** Return the plugin version. */
	private static function plugin_version(): string {
		return defined( 'Blixis\\Builder\\VERSION' ) ? (string) constant( 'Blixis\\Builder\\VERSION' ) : '0.1.0'; }
}
