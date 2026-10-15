<?php
/**
 * Shared authorization and theme lock policy.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Rest;

use Blixis\Builder\Theme\ThemeCompat;
\defined( 'ABSPATH' ) || exit;
/** Checks identity and post capabilities before revealing compatibility state. */
final class ThemeGuard {
	/** Create the policy.
	 *
	 * @param PostAccess  $access Post authorization.
	 * @param ThemeCompat $compat Request-scoped theme status.
	 */
	public function __construct( private PostAccess $access, private ThemeCompat $compat ) {}
	/** Check access before evaluating compatibility.
	 *
	 * @param int  $post_id Post ID.
	 * @param bool $changes_state Whether storage or publication changes.
	 * @param bool $needs_publish Whether publish capability is required.
	 */
	public function permission( int $post_id, bool $changes_state = false, bool $needs_publish = false ): ?DocumentResult {
		if ( ! $this->access->is_authenticated() ) {
			return DocumentResult::error( 401, 'blixis_unauthenticated', 'Authentication is required.' );
		}
		if ( $post_id < 1 || ! $this->access->exists( $post_id ) || ! $this->access->is_opted_in( $post_id ) || ! $this->access->can_edit( $post_id ) || ( $needs_publish && ! $this->access->can_publish( $post_id ) ) ) {
			return DocumentResult::error( 403, 'blixis_forbidden', 'Document access is forbidden.' );
		}
		$status = $changes_state ? $this->compat->status() : null;
		return null !== $status && ! $status->compatible ? DocumentResult::error( 423, 'blixis_theme_incompatible', 'The active theme does not support Blixis editing.', $status->error_data() ) : null;
	}
}
