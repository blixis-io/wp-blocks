<?php
/**
 * WordPress post authorization adapter.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Rest;

use Blixis\Builder\Storage\MetaRegistration;

\defined( 'ABSPATH' ) || exit;

/** Resolves document access against the current WordPress user and post. */
final class WordPressPostAccess implements PostAccess {
	/** Implement the access contract. */
	public function is_authenticated(): bool {
		return \is_user_logged_in();
	}

	/** Implement the access contract.
	 *
	 * @param int $post_id Post ID.
	 */
	public function exists( int $post_id ): bool {
		return \get_post( $post_id ) instanceof \WP_Post;
	}

	/** Implement the access contract.
	 *
	 * @param int $post_id Post ID.
	 */
	public function is_opted_in( int $post_id ): bool {
		$post = \get_post( $post_id );
		return $post instanceof \WP_Post && \in_array( $post->post_type, MetaRegistration::post_types(), true );
	}

	/** Implement the access contract.
	 *
	 * @param int $post_id Post ID.
	 */
	public function can_edit( int $post_id ): bool {
		return \current_user_can( 'edit_post', $post_id );
	}
}
