<?php
/**
 * Isolated editor screen and entry points.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Admin;

use Blixis\Builder\Locale\LocaleConfig;
use Blixis\Builder\Locale\NativeLocaleRouter;
use Blixis\Builder\Rest\WordPressPostAccess;
use Blixis\Builder\Storage\MetaRegistration;
use Blixis\Builder\Theme\ThemeCompat;
use Blixis\Builder\Theme\WordPressCompatibilityReader;

\defined( 'ABSPATH' ) || exit;

/** Owns the hidden editor page, list-table actions, and front-end admin-bar link. */
final class EditorScreen {
	/** Register hooks. */
	public static function hooks(): void {
		if ( \is_admin() ) {
			\add_action( 'admin_menu', [ self::class, 'menu' ] );
			\add_action( 'admin_init', [ self::class, 'maybe_render' ], 0 );
			\add_filter( 'page_row_actions', [ self::class, 'row_action' ], 10, 2 );
			\add_filter( 'post_row_actions', [ self::class, 'row_action' ], 10, 2 );
			return;
		}
		\add_action( 'admin_bar_menu', [ self::class, 'admin_bar' ], 90 );
	}

	/** Register the page without exposing it in a menu. */
	public static function menu(): void {
		\add_submenu_page( '', \__( 'Blixis Editor', 'blixis-builder' ), \__( 'Blixis Editor', 'blixis-builder' ), 'read', 'blixis-editor', '__return_empty_string' );
	}

	/** Render before admin chrome when this is the isolated screen. */
	public static function maybe_render(): void {
		$pagenow = $GLOBALS['pagenow'] ?? null;
		if ( ! self::is_editor_admin_page( \is_string( $pagenow ) ? $pagenow : '' ) || ! isset( $_GET['page'] ) || 'blixis-editor' !== $_GET['page'] ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only page selector.
			return;
		}
		$config = LocaleConfig::from_option( \get_option( LocaleConfig::OPTION, false ), \get_locale() );
		$query  = [];
		foreach ( [ 'post', 'locale' ] as $key ) {
			if ( isset( $_GET[ $key ] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Values are parsed and validated below.
				$query[ $key ] = \wp_unslash( $_GET[ $key ] ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended, WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Read-only route; strict parser follows immediately.
			}
		}
		$request = EditorRequest::parse( $query, $config );
		$access  = EditorAccess::check( $request->post_id, new WordPressPostAccess(), ( new ThemeCompat( new WordPressCompatibilityReader() ) )->status() );
		if ( EditorAccessResult::UNAUTHENTICATED === $access->state ) {
			return; // Core owns the wp-admin login redirect.
		}
		if ( EditorAccessResult::FORBIDDEN === $access->state ) {
			\wp_die( \esc_html__( 'You are not allowed to open this editor.', 'blixis-builder' ), '', [ 'response' => 403 ] );
		}
		self::render( $request, $config, $access );
	}

	/**
	 * Whether the current request is the real admin.php editor page (pure request gate).
	 *
	 * @param string $pagenow Current WordPress admin script filename.
	 * @return bool
	 */
	public static function is_editor_admin_page( string $pagenow ): bool {
		return 'admin.php' === $pagenow;
	}

	/**
	 * Add a per-row editor link only where editing is authorized.
	 *
	 * @param array<string, string> $actions Existing row links.
	 * @param \WP_Post              $post Current post.
	 * @return array<string, string>
	 */
	public static function row_action( array $actions, \WP_Post $post ): array {
		if ( ! \is_admin() || ! \in_array( $post->post_type, MetaRegistration::post_types(), true ) || ! \current_user_can( 'edit_post', $post->ID ) ) {
			return $actions;
		}
		$theme             = ( new ThemeCompat( new WordPressCompatibilityReader() ) )->status();
		$label             = self::row_action_label( $theme->compatible, \__( 'Edit with Blixis', 'blixis-builder' ), \__( 'View in Blixis (read-only)', 'blixis-builder' ) );
		$url               = EditorUrl::for_post( $post->ID );
		$actions['blixis'] = self::row_action_markup( $url, $label );
		return $actions;
	}

	/**
	 * Build escaped list-table link markup.
	 *
	 * @param string $url Editor URL.
	 * @param string $label Translatable label.
	 * @return string
	 */
	public static function row_action_markup( string $url, string $label ): string {
		return '<a href="' . \esc_url( $url ) . '">' . \esc_html( $label ) . '</a>';
	}

	/**
	 * Choose the translated row-action label from theme compatibility.
	 *
	 * @param bool   $compatible Whether editing is enabled.
	 * @param string $edit_label Translated edit label.
	 * @param string $read_only_label Translated view-only label.
	 * @return string
	 */
	public static function row_action_label( bool $compatible, string $edit_label, string $read_only_label ): string {
		return $compatible ? $edit_label : $read_only_label;
	}

	/** Add the editor link to the front-end admin bar for an editable singular post.
	 *
	 * @param \WP_Admin_Bar $bar Admin bar.
	 */
	public static function admin_bar( \WP_Admin_Bar $bar ): void {
		if ( \is_admin() || ! \is_singular() ) {
			return;
		}
		$post = \get_queried_object();
		if ( ! $post instanceof \WP_Post || ! \in_array( $post->post_type, MetaRegistration::post_types(), true ) || ! \current_user_can( 'edit_post', $post->ID ) ) {
			return;
		}
		$theme = ( new ThemeCompat( new WordPressCompatibilityReader() ) )->status();
		$bar->add_node(
			[
				'id'    => 'blixis-editor',
				'title' => \esc_html( self::row_action_label( $theme->compatible, \__( 'Edit with Blixis', 'blixis-builder' ), \__( 'View in Blixis (read-only)', 'blixis-builder' ) ) ),
				'href'  => \esc_url( EditorUrl::for_post( $post->ID ) ),
			]
		);
	}

	/**
	 * Emit an isolated document and exit before admin templates run.
	 *
	 * @param EditorRequest      $request Validated request.
	 * @param LocaleConfig       $locales Site locale settings.
	 * @param EditorAccessResult $access Allowed or theme-locked status.
	 * @return never
	 */
	private static function render( EditorRequest $request, LocaleConfig $locales, EditorAccessResult $access ): never {
		$post = \get_post( $request->post_id );
		if ( ! $post instanceof \WP_Post ) {
			\wp_die( \esc_html__( 'You are not allowed to open this editor.', 'blixis-builder' ), '', [ 'response' => 403 ] );
		}
		$theme      = ( new ThemeCompat( new WordPressCompatibilityReader() ) )->status();
		$editor_loc = (string) \get_user_locale(); // Editor chrome language, separate from contentLocale.
		if ( ! \Blixis\Builder\Storage\MetaKeys::is_valid_locale( $editor_loc ) ) {
			$editor_loc = 'en_US';
		}
		$assets = EditorAssets::from_manifest( __DIR__ . '/../../assets/editor/manifest.json', \plugins_url( 'assets/editor', \dirname( __DIR__, 2 ) . '/blixis-builder.php' ) );
		if ( null === $assets ) {
			$notice = \current_user_can( 'manage_options' ) ? \__( 'The editor has not been built.', 'blixis-builder' ) : \__( 'The editor is temporarily unavailable.', 'blixis-builder' );
			self::render_unavailable( $notice );
		}
		$assets['js_url']  = (string) \add_query_arg( 'ver', $assets['version'], $assets['js_url'] );
		$assets['css_url'] = (string) \add_query_arg( 'ver', $assets['version'], $assets['css_url'] );
		$admin_url         = \get_edit_post_link( $request->post_id, 'raw' );
		if ( ! \is_string( $admin_url ) || '' === $admin_url ) {
			$admin_url = \admin_url( 'edit.php?post_type=' . \rawurlencode( $post->post_type ) );
		}
		if ( ! EditorBootstrap::same_origin( $admin_url, \admin_url() ) ) {
			$admin_url = \admin_url( 'edit.php?post_type=' . \rawurlencode( $post->post_type ) );
		}
		$canvas_url = EditorUrl::canvas_for_post( $request->post_id, $request->content_locale );
		if ( ! EditorBootstrap::same_origin( $canvas_url, \admin_url() ) ) {
			$canvas_url = '';
		}
		$view_url = \is_post_publicly_viewable( $post ) ? \get_permalink( $request->post_id ) : null;
		if ( \is_string( $view_url ) && ! EditorBootstrap::same_origin( $view_url, \admin_url() ) ) {
			$view_url = null;
		}
		$locale_router = NativeLocaleRouter::instance();
		$preview_base  = null !== $locale_router ? $locale_router->url_for( $request->post_id, $request->content_locale ) : null;
		if ( ! \is_string( $preview_base ) || '' === $preview_base ) {
			$preview_base = \is_post_publicly_viewable( $post ) ? \get_permalink( $request->post_id ) : \get_preview_post_link( $post );
		}
		$preview_url = \is_string( $preview_base ) && '' !== $preview_base ? \add_query_arg( 'blixis_preview', \wp_create_nonce( 'blixis_preview_' . $request->post_id ), $preview_base ) : null;
		if ( \is_string( $preview_url ) && ! EditorBootstrap::same_origin( $preview_url, \admin_url() ) ) {
			$preview_url = null;
		}
		$csp_nonce = EditorHeaders::new_nonce();
		$bootstrap = EditorBootstrap::build(
			[
				'cspNonce'              => $csp_nonce,
				'restRoot'              => \rest_url( 'blixis/v1' ),
				'wpRestRoot'            => \rest_url( 'wp/v2' ),
				'maxUploadBytes'        => (int) \wp_max_upload_size(),
				'canUpload'             => \current_user_can( 'upload_files' ),
				'nonce'                 => \wp_create_nonce( 'wp_rest' ),
				'postId'                => $request->post_id,
				'postTitle'             => $post->post_title,
				'postType'              => $post->post_type,
				'contentLocale'         => $request->content_locale,
				'contentLocaleExplicit' => $request->locale_explicit,
				'defaultLocale'         => $locales->default_locale,
				'enabledLocales'        => $locales->enabled,
				'editorLocale'          => $editor_loc,
				'pluginVersion'         => \Blixis\Builder\VERSION,
				'themeName'             => $theme->theme,
				'editingEnabled'        => EditorAccessResult::ALLOWED === $access->state,
				'seoPluginActive'       => \defined( 'WPSEO_VERSION' ) || \defined( 'RANK_MATH_VERSION' ) || \defined( 'SEOPRESS_VERSION' ) || \defined( 'AIOSEO_VERSION' ),
				'lockReason'            => EditorAccessResult::THEME_LOCKED === $access->state ? $access->lock_reason : null,
				'adminUrl'              => $admin_url,
				'canvasUrl'             => '' !== $canvas_url ? $canvas_url : null,
				'viewUrl'               => \is_string( $view_url ) && '' !== $view_url ? $view_url : null,
				'previewUrl'            => $preview_url,
				'siteUrl'               => \home_url( '/' ),
			]
		);
		foreach ( EditorHeaders::list( $csp_nonce ) as $name => $value ) {
			\header( $name . ': ' . $value );
		}
		$lang = \str_replace( '_', '-', $editor_loc );
		$dir  = \Blixis\Builder\Locale\Direction::is_rtl( $editor_loc ) ? 'rtl' : 'ltr';
		echo '<!doctype html><html lang="' . \esc_attr( $lang ) . '" dir="' . \esc_attr( $dir ) . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>' . \esc_html( (string) $bootstrap['postTitle'] . ' — Blixis Editor' ) . '</title><link rel="stylesheet" href="' . \esc_url( $assets['css_url'] ) . '"></head><body class="blx-editor-page"><div id="blixis-editor-root"></div><script type="application/json" id="blixis-editor-bootstrap">' . EditorBootstrap::to_script_json( $bootstrap ) . '</script><script src="' . \esc_url( $assets['js_url'] ) . '" defer></script><noscript>' . \esc_html__( 'JavaScript is required to use the Blixis editor.', 'blixis-builder' ) . '</noscript></body></html>'; // phpcs:ignore WordPress.WP.EnqueuedResources.NonEnqueuedStylesheet, WordPress.WP.EnqueuedResources.NonEnqueuedScript, WordPress.Security.EscapeOutput.OutputNotEscaped -- This response is the standalone document and both URL/markup slots are escaped or JSON_HEX encoded.
		exit;
	}

	/**
	 * Render a standalone no-bundle response without loading admin chrome.
	 *
	 * @param string $notice Escaped at output.
	 * @return never
	 */
	private static function render_unavailable( string $notice ): never {
		\status_header( 503 );
		foreach ( EditorHeaders::list( EditorHeaders::new_nonce() ) as $name => $value ) {
			\header( $name . ': ' . $value );
		}
		echo '<!doctype html><html lang="' . \esc_attr( \str_replace( '_', '-', (string) \get_user_locale() ) ) . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>' . \esc_html__( 'Blixis Editor', 'blixis-builder' ) . '</title></head><body class="blx-editor-page"><main role="alert">' . \esc_html( $notice ) . '</main></body></html>';
		exit;
	}
}
