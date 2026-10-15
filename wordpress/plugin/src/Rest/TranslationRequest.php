<?php
/**
 * Request policy of the translation status route.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Rest;

use Blixis\Builder\Locale\TranslationStatus;
use Blixis\Builder\Registry\ElementRegistry;
use Blixis\Builder\Storage\Envelope;
use Blixis\Builder\Storage\MetaKeys;
use Blixis\Builder\Storage\StreamStore;

\defined( 'ABSPATH' ) || exit;

/** Read-only: how each element of a locale stands against the default-locale source text. */
final class TranslationRequest {
	/**
	 * Create the policy.
	 *
	 * @param StreamStore     $streams Working streams.
	 * @param PostAccess      $access Post access policy.
	 * @param SiteLocale      $site Site languages.
	 * @param ElementRegistry $registry Element registry.
	 */
	public function __construct( private readonly StreamStore $streams, private readonly PostAccess $access, private readonly SiteLocale $site, private readonly ElementRegistry $registry ) {}

	/**
	 * Same access rules as the document routes (401, uniform 403).
	 *
	 * @param int $post_id Post ID.
	 * @return ?DocumentResult Null when allowed.
	 */
	public function permission( int $post_id ): ?DocumentResult {
		return ( new DocumentRequest( $this->streams, $this->access ) )->permission( $post_id );
	}

	/**
	 * Translation status of one locale.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $locale Target locale.
	 * @return DocumentResult
	 */
	public function status( int $post_id, string $locale ): DocumentResult {
		if ( ! MetaKeys::is_valid_locale( $locale ) ) {
			return DocumentResult::error( 400, 'blixis_invalid_locale', 'Invalid locale.' );
		}
		$default = $this->site->default_locale();
		try {
			$layout  = $this->stream( $post_id, MetaKeys::LAYOUT );
			$source  = $this->entries( $this->stream( $post_id, MetaKeys::content( $default ) ) );
			$target  = $locale === $default ? $source : $this->entries( $this->stream( $post_id, MetaKeys::content( $locale ) ) );
			$result  = TranslationStatus::compute( $layout ?? new \stdClass(), $source, $target, $this->registry );
			$current = $this->streams->read( $post_id, MetaKeys::content( $locale ) );
			return DocumentResult::success(
				[
					'locale'        => $locale,
					'defaultLocale' => $default,
					'isSource'      => $locale === $default,
					'revision'      => $current['revision'] ?? 0,
					'elements'      => (object) $result['elements'],
					'counts'        => (object) $result['counts'],
				],
				$current['revision'] ?? 0
			);
		} catch ( \RuntimeException $error ) {
			return DocumentResult::error( 500, 'blixis_storage_error', 'Document storage failed.' );
		}
	}

	/**
	 * Decode a working stream, or null when it was never written.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $key Stream key.
	 * @return ?\stdClass
	 */
	private function stream( int $post_id, string $key ): ?\stdClass {
		$stored = $this->streams->read( $post_id, $key );
		return null === $stored ? null : Envelope::decode( $stored['value'], $key );
	}

	/**
	 * The entries of a content stream.
	 *
	 * @param ?\stdClass $content Decoded content stream.
	 * @return \stdClass
	 */
	private function entries( ?\stdClass $content ): \stdClass {
		$entries = $content->entries ?? $content->translations ?? null;
		return $entries instanceof \stdClass ? $entries : new \stdClass();
	}
}
