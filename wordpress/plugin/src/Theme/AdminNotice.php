<?php
/**
 * Incompatible theme admin notice.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Theme;

\defined( 'ABSPATH' ) || exit;
/** Safe notice for users allowed to edit posts. */
final class AdminNotice {
	/** Register the admin hook. */
	public static function hooks(): void {
		\add_action( 'admin_notices', [ self::class, 'show' ] );
	}
	/** Print on dashboard, themes and plugins for users who can act on the information. */
	public static function show(): void {
		if ( ! \current_user_can( 'edit_posts' ) || ! \in_array( \get_current_screen()?->id, [ 'dashboard', 'themes', 'plugins' ], true ) ) {
			return;
		}
		$status = ( new ThemeCompat( new WordPressCompatibilityReader() ) )->status();
		if ( ! $status->compatible ) {
			echo self::html( $status->theme, \admin_url( 'themes.php' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- html() escapes all dynamic values.
		}
	}
	/** Produce an escaped, translatable notice.
	 *
	 * @param string $theme Active theme name.
	 *
	 * @param string $themes_url Themes screen URL.
	 */
	public static function html( string $theme, string $themes_url ): string {
		// translators: %s is the active theme name.
		$message = \sprintf( \__( 'The Blixis Builder editor is disabled because the active theme "%s" is not Blixis-compatible. Your content is preserved and still shown on the site.', 'blixis-builder' ), $theme );
		return '<div class="notice notice-warning"><p>' . \esc_html( $message ) . ' <a href="' . \esc_url( $themes_url ) . '">' . \esc_html__( 'Choose a compatible theme', 'blixis-builder' ) . '</a></p></div>';
	}
}
