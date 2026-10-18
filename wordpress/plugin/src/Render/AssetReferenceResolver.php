<?php
/** Resolver for imported template asset references.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

\defined( 'ABSPATH' ) || exit;

/** Resolves a stable template asset key to an approved media-library image. */
interface AssetReferenceResolver extends MediaResolver {
	/** Resolve an imported asset reference.
	 *
	 * @param string $reference Stable pack asset key.
	 * @return array{url:string,width:int,height:int,alt:string,srcset?:string,sizes?:string}|null Resolved image.
	 */
	public function resolve_reference( string $reference ): ?array;
}
