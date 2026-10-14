<?php
/**
 * Document REST request policy without WordPress transport dependencies.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Rest;

use Blixis\Builder\Storage\Envelope;
use Blixis\Builder\Storage\MetaKeys;
use Blixis\Builder\Storage\StreamStore;

\defined( 'ABSPATH' ) || exit;

/** Validates addresses, preconditions and storage results. */
final class DocumentRequest {
	/**
	 * Create the request policy.
	 *
	 * @param StreamStore $streams Working stream repository.
	 * @param PostAccess  $access Post access policy.
	 */
	public function __construct( private StreamStore $streams, private PostAccess $access ) {}

	/** Check access without revealing whether a forbidden post exists.
	 *
	 * @param int $post_id Post ID.
	 */
	public function permission( int $post_id ): ?DocumentResult {
		if ( ! $this->access->is_authenticated() ) {
			return DocumentResult::error( 401, 'blixis_unauthenticated', 'Authentication is required.' );
		}
		if ( $post_id < 1 || ! $this->access->exists( $post_id ) || ! $this->access->is_opted_in( $post_id ) || ! $this->access->can_edit( $post_id ) ) {
			return DocumentResult::error( 403, 'blixis_forbidden', 'Document access is forbidden.' );
		}
		return null;
	}

	/** Parse only canonical quoted decimal ETags.
	 *
	 * @param string|null $header If-Match header.
	 */
	public static function parse_if_match( ?string $header ): ?int {
		if ( null === $header || 1 !== \preg_match( '/^"(0|[1-9][0-9]*)"$/D', $header, $matches ) ) {
			return null;
		}
		$value = $matches[1];
		if ( \strlen( $value ) > \strlen( (string) PHP_INT_MAX ) || (string) (int) $value !== $value || PHP_INT_MAX === (int) $value ) {
			return null;
		}
		return (int) $value;
	}

	/** Format a revision as a strong ETag.
	 *
	 * @param int $revision Revision.
	 */
	public static function etag( int $revision ): string {
		return '"' . $revision . '"';
	}

	/**
	 * Read one working stream.
	 *
	 * @param int         $post_id Post ID.
	 * @param string|null $locale Null for layout.
	 */
	public function get( int $post_id, ?string $locale ): DocumentResult {
		$key = self::key( $locale );
		if ( null === $key ) {
			return DocumentResult::error( 400, 'blixis_invalid_locale', 'Invalid locale.' );
		}
		try {
			$stored = $this->streams->read( $post_id, $key );
			if ( null === $stored ) {
				return DocumentResult::success(
					[
						'revision' => 0,
						'document' => null,
					],
					0
				);
			}
			$document = Envelope::decode( $stored['value'], $key );
			if ( null === $document ) {
				return self::storage_error();
			}
			return DocumentResult::success(
				[
					'revision' => $stored['revision'],
					'document' => $document,
				],
				$stored['revision']
			);
		} catch ( \RuntimeException $exception ) {
			return self::storage_error();
		}
	}

	/**
	 * Compare-and-swap one working stream.
	 *
	 * @param int         $post_id Post ID.
	 * @param string|null $locale Null for layout.
	 * @param string|null $if_match Raw If-Match header.
	 * @param string      $body Raw request body.
	 * @param string      $content_type Raw Content-Type header.
	 */
	public function put( int $post_id, ?string $locale, ?string $if_match, string $body, string $content_type ): DocumentResult {
		$key = self::key( $locale );
		if ( null === $key ) {
			return DocumentResult::error( 400, 'blixis_invalid_locale', 'Invalid locale.' );
		}
		if ( null === $if_match || '' === $if_match ) {
			return DocumentResult::error( 428, 'blixis_precondition_required', 'If-Match is required.' );
		}
		$expected = self::parse_if_match( $if_match );
		if ( null === $expected ) {
			return DocumentResult::error( 400, 'blixis_invalid_revision', 'Invalid revision.' );
		}
		if ( \strlen( $body ) > Envelope::MAX_BYTES ) {
			return DocumentResult::error( 413, 'blixis_too_large', 'Document is too large.' );
		}
		if ( 1 !== \preg_match( '~^application/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$~iD', $content_type ) ) {
			return DocumentResult::error( 422, 'blixis_invalid_document', 'Invalid document.' );
		}
		try {
			$result = $this->streams->write( $post_id, $key, $body, $expected );
			if ( ! $result->success ) {
				return DocumentResult::error(
					409,
					'blixis_conflict',
					'Document revision conflict.',
					[
						'currentRevision'  => $result->revision,
						'expectedRevision' => $result->expected_revision,
					]
				);
			}
			return DocumentResult::success( [ 'revision' => $result->revision ], $result->revision );
		} catch ( \InvalidArgumentException $exception ) {
			return DocumentResult::error( 422, 'blixis_invalid_document', 'Invalid document.' );
		} catch ( \RuntimeException $exception ) {
			return self::storage_error();
		}
	}

	/** Return only a working stream key.
	 *
	 * @param string|null $locale Content locale or null for layout.
	 */
	private static function key( ?string $locale ): ?string {
		if ( null === $locale ) {
			return MetaKeys::LAYOUT;
		}
		return MetaKeys::is_valid_locale( $locale ) ? MetaKeys::content( $locale ) : null;
	}

	/** Hide storage exception details from responses and logs. */
	private static function storage_error(): DocumentResult {
		return DocumentResult::error( 500, 'blixis_storage_error', 'Document storage failed.' );
	}
}
