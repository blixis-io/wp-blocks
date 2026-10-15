<?php
/**
 * Editor access policy.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Admin;

use Blixis\Builder\Rest\PostAccess;
use Blixis\Builder\Theme\ThemeStatus;

\defined( 'ABSPATH' ) || exit;

/** Applies a uniform per-post editor access policy. */
final class EditorAccess {
	/**
	 * Check access to the editor.
	 *
	 * @param int         $post_id Post ID.
	 * @param PostAccess  $posts Post access adapter.
	 * @param ThemeStatus $theme Active theme status.
	 * @return EditorAccessResult
	 */
	public static function check( int $post_id, PostAccess $posts, ThemeStatus $theme ): EditorAccessResult {
		if ( ! $posts->is_authenticated() ) {
			return new EditorAccessResult( EditorAccessResult::UNAUTHENTICATED );
		}
		if ( $post_id < 1 || ! $posts->exists( $post_id ) || ! $posts->is_opted_in( $post_id ) || ! $posts->can_edit( $post_id ) ) {
			return new EditorAccessResult( EditorAccessResult::FORBIDDEN );
		}
		if ( ! $theme->compatible ) {
			return new EditorAccessResult( EditorAccessResult::THEME_LOCKED, $theme->reason );
		}
		return new EditorAccessResult( EditorAccessResult::ALLOWED );
	}
}
